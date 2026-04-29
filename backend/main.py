"""
Centralized Core AI Engine - Main FastAPI Server with Streaming + Image support
"""

import base64
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json
import uvicorn
from dotenv import load_dotenv

load_dotenv()

from modules.context_memory import ContextMemoryEngine
from modules.multilingual import MultilingualModule
from modules.voice_processor import VoiceProcessorModule
from modules.adaptive_learning import AdaptiveLearningEngine
from modules.reasoning_engine import ReasoningEngine

app = FastAPI(title="Centralized AI Engine", version="2.0.0")

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


# ── Models ────────────────────────────────────────────────────────────────────

class InteractionRequest(BaseModel):
    platform_id: str
    user_id: str
    message: str
    language: Optional[str] = "en"
    session_id: Optional[str] = None
    image_base64: Optional[str] = None  # base64 encoded image


# ── Streaming endpoint ────────────────────────────────────────────────────────

@app.post("/api/interact/stream")
async def interact_stream(request: InteractionRequest):
    """
    Streams the AI response token by token using Server-Sent Events (SSE).
    Frontend reads this as a ReadableStream.
    """
    try:
        detected_lang, normalized_text = multilingual_module.process(
            request.message, request.language
        )
        target_lang_name = multilingual_module.SUPPORTED_LANGUAGES.get(detected_lang, "English")
        context = context_engine.get_context(request.user_id, request.session_id)

        def event_generator():
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
                    # SSE format: data: {...}\n\n
                    payload = json.dumps({"chunk": chunk, "session_id": session_id})
                    yield f"data: {payload}\n\n"

            except GeneratorExit:
                # Client disconnected / stopped — save whatever we have
                pass
            finally:
                if full_response:
                    context_engine.update(request.user_id, request.message, full_response, final_session_id)
                    adaptive_engine.record_interaction(request.user_id, request.message, full_response)
                # Signal done
                yield f"data: {json.dumps({'done': True, 'session_id': final_session_id})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Non-streaming fallback ────────────────────────────────────────────────────

@app.post("/api/interact")
async def interact(request: InteractionRequest):
    try:
        detected_lang, normalized_text = multilingual_module.process(
            request.message, request.language
        )
        target_lang_name = multilingual_module.SUPPORTED_LANGUAGES.get(detected_lang, "English")
        context = context_engine.get_context(request.user_id, request.session_id)
        response_text, confidence, session_id = reasoning_engine.generate(
            platform_id=request.platform_id,
            user_id=request.user_id,
            message=normalized_text,
            context=context,
            target_lang_name=target_lang_name,
            session_id=request.session_id,
            image_base64=request.image_base64,
        )
        context_engine.update(request.user_id, request.message, response_text, session_id)
        adaptive_engine.record_interaction(request.user_id, request.message, response_text)
        return {
            "response_text": response_text,
            "detected_language": detected_lang,
            "context_used": bool(context),
            "confidence_score": confidence,
            "session_id": session_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Voice endpoints ───────────────────────────────────────────────────────────

@app.post("/api/voice/transcribe")
async def transcribe_voice(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    text = voice_module.speech_to_text(audio_bytes)
    return {"transcribed_text": text}


@app.post("/api/voice/synthesize")
async def synthesize_voice(text: str, language: str = "en"):
    audio_b64 = voice_module.text_to_speech(text, language)
    return {"audio_base64": audio_b64}


# ── Context endpoints ─────────────────────────────────────────────────────────

@app.get("/api/context/{user_id}")
async def get_user_context(user_id: str):
    context = context_engine.get_context(user_id)
    return {"user_id": user_id, "context": context}


@app.delete("/api/context/{user_id}")
async def clear_user_context(user_id: str):
    context_engine.clear(user_id)
    return {"message": f"Context cleared for user {user_id}"}


@app.get("/api/sessions/{user_id}")
async def get_sessions(user_id: str):
    sessions = context_engine.get_sessions(user_id)
    return {"sessions": sessions}


@app.get("/api/history/{user_id}/{session_id}")
async def get_session_history(user_id: str, session_id: str):
    from modules.database import get_connection
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT user_msg, ai_response FROM context_memory 
        WHERE user_id = ? AND session_id = ? 
        ORDER BY timestamp ASC
    ''', (user_id, session_id))
    rows = cursor.fetchall()
    conn.close()
    
    messages = []
    for r in rows:
        messages.append({"role": "user", "content": r[0]})
        messages.append({"role": "assistant", "content": r[1]})
    return {"messages": messages}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "engine": "Centralized AI Engine v2.0"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)