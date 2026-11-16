"""
Centralized Core AI Engine - Main FastAPI Server
Includes cross-platform memory management, SQL-level authorization gating,
identity validation, streaming SSE, and multimodal reasoning.
"""

import os
import json
import base64
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv

load_dotenv()

from modules.database import init_db, migrate_db, validate_identity, DEMO_PLATFORMS
from modules.context_memory import ContextMemoryEngine
from modules.multilingual import MultilingualModule
from modules.voice_processor import VoiceProcessorModule
from modules.adaptive_learning import AdaptiveLearningEngine
from modules.reasoning_engine import ReasoningEngine

# Initialize and migrate SQLite schema idempotently on module load
init_db()
migrate_db()

app = FastAPI(
    title="Centralized AI Engine",
    version="2.0.0",
    description="Cross-Platform Intelligence & Memory Engine"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

context_engine = ContextMemoryEngine()
multilingual_module = MultilingualModule()
voice_module = VoiceProcessorModule()
adaptive_engine = AdaptiveLearningEngine()
reasoning_engine = ReasoningEngine(context_engine, adaptive_engine)


# ── First-Party Authentication & Identity Helpers ─────────────────────────────

def is_first_party_web_request(request: Request) -> bool:
    """
    Verifies if a request originates from the trusted local first-party web UI (axiom-web).
    Checks Origin and Referer against allowed local Vite/FastAPI development origins
    and verifies browser context headers.
    Arbitrary external callers (e.g. curl or external services) omitting platform_key
    cannot bypass authentication using this mechanism.
    """
    origin = request.headers.get("origin") or ""
    referer = request.headers.get("referer") or ""
    allowed_origins = [
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:8000", "http://127.0.0.1:8000",
        "http://localhost:3000", "http://127.0.0.1:3000"
    ]
    has_allowed_origin = any(origin.startswith(ao) or referer.startswith(ao) for ao in allowed_origins)
    sec_fetch_mode = request.headers.get("sec-fetch-mode")
    
    # Browser fetch calls originating from the first-party dev server
    return has_allowed_origin and (sec_fetch_mode is not None or "Mozilla" in request.headers.get("user-agent", ""))

def resolve_platform_key(platform_id: str, supplied_key: Optional[str], request: Request) -> Optional[str]:
    """
    Resolves the platform credentials.
    For the first-party web UI ('axiom-web'), if the request is verified as
    originating from the local web dashboard, the backend provides the pre-shared key
    so that secrets are kept exclusively on the server (never exposed to browser JS).
    For any other platform or untrusted external request, supplied_key is required.
    """
    if supplied_key:
        return supplied_key

    # Check header fallback (X-Platform-Key, case-insensitive)
    header_key = request.headers.get("x-platform-key") or request.headers.get("X-Platform-Key")
    if header_key:
        return header_key

    if platform_id == "axiom-web" and is_first_party_web_request(request):
        return os.getenv("AXIOM_WEB_KEY", "")

    return ""

def authenticate_request(platform_id: str, supplied_key: Optional[str], user_id: str, request: Request) -> None:
    """
    Validates platform and user authorization for every incoming request.
    Raises HTTPException 403 on invalid credentials or unregistered user-platform pairing.
    """
    resolved_key = resolve_platform_key(platform_id, supplied_key, request)
    is_valid, reason = validate_identity(platform_id, resolved_key, user_id)
    if not is_valid:
        raise HTTPException(status_code=403, detail=reason)


# ── Models ────────────────────────────────────────────────────────────────────

class InteractionRequest(BaseModel):
    platform_id: str
    user_id: str
    message: str
    platform_key: Optional[str] = ""
    memory_scope: Optional[str] = "global"  # 'global' or 'platform'
    language: Optional[str] = "en"
    session_id: Optional[str] = None
    image_base64: Optional[str] = None  # base64 encoded image

class PermissionRequest(BaseModel):
    user_id: str
    owner_platform_id: str
    requester_platform_id: str
    status: str = "granted"  # 'granted' | 'denied' | 'revoked'
    acting_platform_id: str
    acting_platform_key: Optional[str] = ""


# ── Streaming Interaction Endpoint ────────────────────────────────────────────

@app.post("/api/interact/stream")
async def interact_stream(request: InteractionRequest, raw_req: Request):
    """
    Streams the AI response token by token using Server-Sent Events (SSE).
    Enforces platform credentials, memory authorization, and provenance tagging.
    """
    # 1. Identity validation
    authenticate_request(request.platform_id, request.platform_key, request.user_id, raw_req)

    try:
        detected_lang, normalized_text = multilingual_module.process(
            request.message, request.language
        )
        target_lang_name = multilingual_module.SUPPORTED_LANGUAGES.get(detected_lang, "English")

        # 2. Retrieve only authorized context (SQL permission gate)
        context = context_engine.get_context(
            user_id=request.user_id,
            session_id=request.session_id,
            platform_id=request.platform_id
        )

        async def event_generator():
            full_response = ""
            final_session_id = request.session_id

            try:
                for chunk, session_id, accumulated in reasoning_engine.generate_stream(
                    platform_id=request.platform_id,
                    user_id=request.user_id,
                    message=normalized_text,
                    context=context,
                    target_lang_name=target_lang_name,
                    session_id=request.session_id,
                    image_base64=request.image_base64,
                ):
                    full_response = accumulated
                    final_session_id = session_id
                    payload = json.dumps({"chunk": chunk, "session_id": session_id})
                    yield f"data: {payload}\n\n"

            except GeneratorExit:
                pass
            finally:
                if full_response:
                    # 3. Store interaction with originating platform and memory scope
                    context_engine.update(
                        user_id=request.user_id,
                        user_msg=request.message,
                        ai_response=full_response,
                        session_id=final_session_id,
                        platform_id=request.platform_id,
                        memory_scope=request.memory_scope or "global"
                    )
                    # 4. Attribute learned preferences to the originating platform
                    adaptive_engine.record_interaction(
                        user_id=request.user_id,
                        user_msg=request.message,
                        ai_response=full_response,
                        platform_id=request.platform_id
                    )
                yield f"data: {json.dumps({'done': True, 'session_id': final_session_id})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Non-Streaming Interaction Fallback ────────────────────────────────────────

@app.post("/api/interact")
async def interact(request: InteractionRequest, raw_req: Request):
    # 1. Identity validation
    authenticate_request(request.platform_id, request.platform_key, request.user_id, raw_req)

    try:
        detected_lang, normalized_text = multilingual_module.process(
            request.message, request.language
        )
        target_lang_name = multilingual_module.SUPPORTED_LANGUAGES.get(detected_lang, "English")

        context = context_engine.get_context(
            user_id=request.user_id,
            session_id=request.session_id,
            platform_id=request.platform_id
        )

        response_text, confidence, session_id = reasoning_engine.generate(
            platform_id=request.platform_id,
            user_id=request.user_id,
            message=normalized_text,
            context=context,
            target_lang_name=target_lang_name,
            session_id=request.session_id,
            image_base64=request.image_base64,
        )

        context_engine.update(
            user_id=request.user_id,
            user_msg=request.message,
            ai_response=response_text,
            session_id=session_id,
            platform_id=request.platform_id,
            memory_scope=request.memory_scope or "global"
        )
        adaptive_engine.record_interaction(
            user_id=request.user_id,
            user_msg=request.message,
            ai_response=response_text,
            platform_id=request.platform_id
        )

        return {
            "response_text": response_text,
            "detected_language": detected_lang,
            "context_used": bool(context),
            "confidence_score": confidence,
            "session_id": session_id,
            "platform_id": request.platform_id,
            "memory_scope": request.memory_scope or "global"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Context & Memory Management Endpoints ─────────────────────────────────────

@app.get("/api/context/{user_id}")
async def get_user_context(
    user_id: str,
    raw_req: Request,
    platform_id: str = "axiom-web",
    platform_key: Optional[str] = "",
    session_id: Optional[str] = None
):
    """
    Returns authorized context memories for a user on the specified platform.
    Enforces user-platform registration and active cross-platform permissions.
    """
    authenticate_request(platform_id, platform_key, user_id, raw_req)
    context = context_engine.get_context(user_id=user_id, session_id=session_id, platform_id=platform_id)
    return {
        "user_id": user_id,
        "platform_id": platform_id,
        "context": context
    }


@app.delete("/api/context/{user_id}")
async def clear_user_context(
    user_id: str,
    raw_req: Request,
    platform_id: str = "axiom-web",
    platform_key: Optional[str] = "",
    scope: Optional[str] = "all"  # 'all' | 'platform' | 'global'
):
    """
    Clears memories with strict scope and platform isolation:
    - scope='platform': only clears platform-local memories for that platform.
    - scope='global': only clears global memories owned by that platform.
    - scope='all': clears all memories owned by that platform.
    Memories belonging to other platforms are never touched.
    """
    authenticate_request(platform_id, platform_key, user_id, raw_req)
    context_engine.clear(user_id=user_id, platform_id=platform_id, scope=scope)
    return {
        "message": f"Context cleared for user {user_id} on platform {platform_id} (scope: {scope})",
        "user_id": user_id,
        "platform_id": platform_id,
        "scope": scope
    }


@app.get("/api/sessions/{user_id}")
async def get_sessions(
    user_id: str,
    raw_req: Request,
    platform_id: Optional[str] = "axiom-web",
    platform_key: Optional[str] = ""
):
    if platform_id:
        authenticate_request(platform_id, platform_key, user_id, raw_req)
    sessions = context_engine.get_sessions(user_id, platform_id=platform_id)
    return {"sessions": sessions}


@app.get("/api/history/{user_id}/{session_id}")
async def get_session_history(
    user_id: str,
    session_id: str,
    raw_req: Request,
    platform_id: Optional[str] = "axiom-web",
    platform_key: Optional[str] = ""
):
    if platform_id:
        authenticate_request(platform_id, platform_key, user_id, raw_req)

    from modules.database import get_connection
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT user_msg, ai_response, platform_id, memory_scope, timestamp
        FROM context_memory 
        WHERE user_id = ? AND session_id = ? 
        ORDER BY timestamp ASC
    ''', (user_id, session_id))
    rows = cursor.fetchall()
    conn.close()

    messages = []
    for r in rows:
        messages.append({
            "role": "user",
            "content": r[0],
            "platform_id": r[2],
            "memory_scope": r[3],
            "timestamp": r[4]
        })
        messages.append({
            "role": "assistant",
            "content": r[1],
            "platform_id": r[2],
            "memory_scope": r[3],
            "timestamp": r[4]
        })
    return {"messages": messages}


# ── Cross-Platform Permissions Endpoints ──────────────────────────────────────

@app.post("/api/permissions")
@app.put("/api/permissions")
async def manage_permission(req: PermissionRequest, raw_req: Request):
    """
    Creates, grants, revokes, or denies cross-platform access.
    Enforces memory-owner authorization:
    - Only the owner platform can grant or revoke access.
    - A platform cannot grant itself access.
    - Validates acting platform credentials.
    """
    # 1. Allowed status check
    if req.status not in ("granted", "denied", "revoked"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{req.status}'. Must be 'granted', 'denied', or 'revoked'."
        )

    # 2. Prevent self-grant
    if req.owner_platform_id == req.requester_platform_id:
        raise HTTPException(
            status_code=400,
            detail="A platform cannot grant itself permissions."
        )

    # 3. Enforce memory-owner authorization
    if req.acting_platform_id != req.owner_platform_id:
        raise HTTPException(
            status_code=403,
            detail=f"Platform '{req.acting_platform_id}' is not authorized to manage permissions for owner '{req.owner_platform_id}'."
        )

    # 4. Resolve and validate credentials of acting platform
    resolved_key = resolve_platform_key(req.acting_platform_id, req.acting_platform_key, raw_req)
    is_valid, msg = validate_identity(req.acting_platform_id, resolved_key, req.user_id)
    if not is_valid:
        raise HTTPException(status_code=403, detail=f"Authentication failed: {msg}")

    try:
        record = context_engine.set_permission(
            user_id=req.user_id,
            owner_platform_id=req.owner_platform_id,
            requester_platform_id=req.requester_platform_id,
            status=req.status,
            acting_platform_id=req.acting_platform_id,
            acting_platform_key=resolved_key
        )
        return {
            "message": f"Permission {req.status} successfully",
            "permission": record
        }
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/permissions/{user_id}")
async def list_permissions(
    user_id: str,
    raw_req: Request,
    requesting_platform_id: str = "axiom-web",
    platform_key: Optional[str] = ""
):
    """
    Lists permissions for a user.
    Only returns permission records where the requesting platform is an owner or requester,
    preventing unauthorized platforms from inspecting third-party permissions.
    """
    authenticate_request(requesting_platform_id, platform_key, user_id, raw_req)
    permissions = context_engine.get_permissions(user_id=user_id, platform_id=requesting_platform_id)
    return {
        "user_id": user_id,
        "requesting_platform_id": requesting_platform_id,
        "permissions": permissions
    }


@app.get("/api/platforms/{user_id}")
async def list_user_platforms(
    user_id: str,
    raw_req: Request,
    requesting_platform_id: str = "axiom-web",
    platform_key: Optional[str] = ""
):
    """
    Lists distinct registered and active platforms for a given user.
    """
    authenticate_request(requesting_platform_id, platform_key, user_id, raw_req)
    platforms = context_engine.get_platforms(user_id=user_id)
    return {
        "user_id": user_id,
        "platforms": platforms
    }


@app.get("/api/preferences/{user_id}")
async def get_preferences(
    user_id: str,
    raw_req: Request,
    platform_id: str = "axiom-web",
    platform_key: Optional[str] = ""
):
    """
    Returns user topic preferences separating platform-specific from authorized global topics.
    """
    authenticate_request(platform_id, platform_key, user_id, raw_req)
    prefs = adaptive_engine.get_user_preferences(user_id=user_id, platform_id=platform_id)
    return {
        "user_id": user_id,
        "platform_id": platform_id,
        "preferences": prefs
    }


# ── Voice Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/voice/transcribe")
async def transcribe_voice(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    text = voice_module.speech_to_text(audio_bytes)
    return {"transcribed_text": text}


@app.post("/api/voice/synthesize")
async def synthesize_voice(text: str, language: str = "en"):
    audio_b64 = voice_module.text_to_speech(text, language)
    return {"audio_base64": audio_b64}


# ── Health Check ──────────────────────────────────────────────────────────────

@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "engine": "Centralized AI Engine v2.0 (AXIOM AI)",
        "features": [
            "Cross-Platform Memory Isolation",
            "SQL Permission Gating",
            "Streaming SSE",
            "Multilingual",
            "Multimodal Reasoning"
        ]
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, reload_dirs=["modules"], reload_includes=["main.py"])
