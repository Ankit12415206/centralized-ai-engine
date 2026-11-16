"""
Stage 4 FastAPI Integration Test Suite:
1. Health check endpoint
2. First-party authentication and credential enforcement
3. Permission API security (owner authorization, self-grant prevention, status validation)
4. Deletion scope and cross-platform isolation
5. Streaming SSE and fallback interaction endpoints
6. Platforms list and preferences separation endpoints
"""

import os
import sys
import json
import uuid
from unittest.mock import patch, MagicMock

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
EDU_KEY = os.getenv("EDUCATION_PLATFORM_KEY")

from fastapi import HTTPException
import main
from main import (
    InteractionRequest,
    PermissionRequest,
    context_engine,
    adaptive_engine
)
from modules.database import get_connection

def run_coro(coro):
    """Executes a coroutine synchronously by stepping through it without network socket event loop overhead."""
    try:
        val = coro.send(None)
        while True:
            try:
                val = coro.send(None)
            except StopIteration as e:
                return e.value
    except StopIteration as e:
        return e.value

class MockRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}

FIRST_PARTY_HEADERS = {
    "origin": "http://localhost:5173",
    "sec-fetch-mode": "cors",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

def test_health():
    print("\n--- Test: Health Check ---")
    data = run_coro(main.health_check())
    assert data["status"] == "healthy"
    assert "Cross-Platform Memory Isolation" in data["features"]
    print("✓ Health check endpoint operational.")

def test_first_party_authentication_and_credentials():
    print("\n--- Test: First-Party & External Platform Authentication ---")
    test_user = "ankit_user"

    # 1. External caller attempting to claim axiom-web without key and without first-party browser context
    try:
        run_coro(main.get_user_context(
            user_id=test_user,
            raw_req=MockRequest(),  # empty headers, external script
            platform_id="axiom-web",
            platform_key=""
        ))
        assert False, "External caller without key should be rejected with 403"
    except HTTPException as e:
        assert e.status_code == 403
        print(f"✓ External caller claiming axiom-web without key rejected with 403: {e.detail}")

    # 2. First-party browser request claiming axiom-web with trusted local origin headers
    res_fp = run_coro(main.get_user_context(
        user_id=test_user,
        raw_req=MockRequest(FIRST_PARTY_HEADERS),
        platform_id="axiom-web",
        platform_key=""
    ))
    assert res_fp["platform_id"] == "axiom-web"
    assert "context" in res_fp
    print("✓ First-party web request with local origin headers accepted.")

    # 3. External platform with valid pre-shared key
    res_edu_valid = run_coro(main.get_user_context(
        user_id=test_user,
        raw_req=MockRequest(),
        platform_id="education-platform",
        platform_key=EDU_KEY
    ))
    assert res_edu_valid["platform_id"] == "education-platform"
    print("✓ External platform with valid pre-shared key accepted.")

    # 4. External platform with invalid key
    try:
        run_coro(main.get_user_context(
            user_id=test_user,
            raw_req=MockRequest(),
            platform_id="education-platform",
            platform_key="wrong-key"
        ))
        assert False, "Should raise 403 for invalid key"
    except HTTPException as e:
        assert e.status_code == 403
        print("✓ External platform with invalid key rejected with 403.")

    # 5. External platform without key
    try:
        run_coro(main.get_user_context(
            user_id=test_user,
            raw_req=MockRequest(),
            platform_id="education-platform",
            platform_key=""
        ))
        assert False, "Should raise 403 for missing key"
    except HTTPException as e:
        assert e.status_code == 403
        print("✓ External platform without key rejected with 403.")

def test_permission_api_security():
    print("\n--- Test: Permission API Security ---")
    test_user = "ankit_user"

    # 1. Invalid status
    try:
        req = PermissionRequest(
            user_id=test_user,
            owner_platform_id="axiom-web",
            requester_platform_id="education-platform",
            status="bad_status_xyz",
            acting_platform_id="axiom-web"
        )
        run_coro(main.manage_permission(req, MockRequest(FIRST_PARTY_HEADERS)))
        assert False, "Should reject invalid status"
    except HTTPException as e:
        assert e.status_code == 400
        assert "Invalid status" in e.detail
        print("✓ Invalid permission status rejected with 400.")

    # 2. Self-grant attempt
    try:
        req = PermissionRequest(
            user_id=test_user,
            owner_platform_id="axiom-web",
            requester_platform_id="axiom-web",
            status="granted",
            acting_platform_id="axiom-web"
        )
        run_coro(main.manage_permission(req, MockRequest(FIRST_PARTY_HEADERS)))
        assert False, "Should reject self grant"
    except HTTPException as e:
        assert e.status_code == 400
        assert "cannot grant itself" in e.detail
        print("✓ Self-grant attempt rejected with 400.")

    # 3. Non-owner attempting to grant permission
    try:
        req = PermissionRequest(
            user_id=test_user,
            owner_platform_id="axiom-web",
            requester_platform_id="education-platform",
            status="granted",
            acting_platform_id="education-platform",
            acting_platform_key=EDU_KEY
        )
        run_coro(main.manage_permission(req, MockRequest()))
        assert False, "Should reject non-owner grant"
    except HTTPException as e:
        assert e.status_code == 403
        assert "not authorized to manage permissions for owner" in e.detail
        print("✓ Non-owner permission modification rejected with 403.")

    # 4. Valid grant by owner platform
    req = PermissionRequest(
        user_id=test_user,
        owner_platform_id="axiom-web",
        requester_platform_id="education-platform",
        status="granted",
        acting_platform_id="axiom-web"
    )
    res_grant = run_coro(main.manage_permission(req, MockRequest(FIRST_PARTY_HEADERS)))
    assert res_grant["permission"]["status"] == "granted"
    print("✓ Valid owner grant succeeded with 200.")

    # 5. Revocation via PUT
    req_revoke = PermissionRequest(
        user_id=test_user,
        owner_platform_id="axiom-web",
        requester_platform_id="education-platform",
        status="revoked",
        acting_platform_id="axiom-web"
    )
    res_revoke = run_coro(main.manage_permission(req_revoke, MockRequest(FIRST_PARTY_HEADERS)))
    assert res_revoke["permission"]["status"] == "revoked"
    print("✓ Revocation succeeded with status='revoked'.")

    # 6. Listing permissions
    res_list = run_coro(main.list_permissions(
        user_id=test_user,
        raw_req=MockRequest(FIRST_PARTY_HEADERS),
        requesting_platform_id="axiom-web"
    ))
    assert "permissions" in res_list
    assert len(res_list["permissions"]) >= 1
    print("✓ Permission listing endpoint operational.")

def test_deletion_scope_and_isolation():
    print("\n--- Test: Deletion Scope and Isolation ---")
    test_user = "ankit_user"
    sess = "sess-del-api-" + str(uuid.uuid4())[:8]

    # Seed memories on axiom-web and education-platform
    context_engine.update(test_user, "Axiom Global Msg", "Axiom Resp", sess, platform_id="axiom-web", memory_scope="global")
    context_engine.update(test_user, "Axiom Local Msg", "Axiom Resp", sess, platform_id="axiom-web", memory_scope="platform")
    context_engine.update(test_user, "Edu Global Msg", "Edu Resp", sess, platform_id="education-platform", memory_scope="global")
    context_engine.update(test_user, "Edu Local Msg", "Edu Resp", sess, platform_id="education-platform", memory_scope="platform")

    # 1. Delete platform-local memory on axiom-web
    res_del_local = run_coro(main.clear_user_context(
        user_id=test_user,
        raw_req=MockRequest(FIRST_PARTY_HEADERS),
        platform_id="axiom-web",
        platform_key="",
        scope="platform"
    ))
    assert res_del_local["scope"] == "platform"

    # Verify axiom-web global memory is STILL intact
    axiom_ctx = context_engine.get_context(test_user, session_id=sess, platform_id="axiom-web")
    axiom_msgs = [m["user"] for m in axiom_ctx]
    assert "Axiom Global Msg" in axiom_msgs, "Global memory must NOT be deleted by platform-scope deletion"
    assert "Axiom Local Msg" not in axiom_msgs, "Local memory must be deleted"

    # Verify education-platform memories are 100% UNTOUCHED
    edu_ctx = context_engine.get_context(test_user, session_id=sess, platform_id="education-platform")
    edu_msgs = [m["user"] for m in edu_ctx]
    assert "Edu Global Msg" in edu_msgs, "Education memories must never be deleted by axiom-web deletion"
    assert "Edu Local Msg" in edu_msgs, "Education memories must never be deleted by axiom-web deletion"
    print("✓ Platform-local deletion isolation verified: other scopes and platforms untouched.")

    # 2. Delete global memory on axiom-web
    res_del_global = run_coro(main.clear_user_context(
        user_id=test_user,
        raw_req=MockRequest(FIRST_PARTY_HEADERS),
        platform_id="axiom-web",
        platform_key="",
        scope="global"
    ))
    assert res_del_global["scope"] == "global"

    axiom_ctx_post = context_engine.get_context(test_user, session_id=sess, platform_id="axiom-web")
    assert len(axiom_ctx_post) == 0, "Axiom global memory should now be deleted"

    # Verify education-platform memories STILL untouched
    edu_ctx_post = context_engine.get_context(test_user, session_id=sess, platform_id="education-platform")
    assert len(edu_ctx_post) == 2, "Education memories must still remain completely intact"
    print("✓ Global memory deletion isolation verified: other platforms remained completely intact.")

def test_interaction_endpoints():
    print("\n--- Test: Interaction Endpoints (Streaming & Fallback) ---")
    test_user = "ankit_user"

    def mock_stream(*args, **kwargs):
        yield "Hello ", "sess-mock-123", "Hello "
        yield "World!", "sess-mock-123", "Hello World!"

    # 1. Test POST /api/interact/stream
    with patch.object(main.reasoning_engine, "generate_stream", side_effect=mock_stream):
        req_stream = InteractionRequest(
            platform_id="axiom-web",
            user_id=test_user,
            message="Hello streaming test",
            memory_scope="global"
        )
        stream_response = run_coro(main.interact_stream(req_stream, MockRequest(FIRST_PARTY_HEADERS)))
        assert stream_response.media_type == "text/event-stream"
        
        # Consume async generator iterator
        chunks = []
        agen = stream_response.body_iterator
        while True:
            try:
                chunk = run_coro(agen.__anext__())
                chunks.append(chunk)
            except StopAsyncIteration:
                break
        
        sse_output = "".join(chunks)
        assert "Hello " in sse_output
        assert "World!" in sse_output
        assert '"done": true' in sse_output
        print("✓ Streaming SSE endpoint returned valid chunks and done signal.")

    # 2. Test POST /api/interact (non-streaming)
    with patch.object(main.reasoning_engine, "generate", return_value=("Mocked response text", 0.95, "sess-mock-456")):
        req_normal = InteractionRequest(
            platform_id="education-platform",
            platform_key=EDU_KEY,
            user_id=test_user,
            message="Hello non-streaming test",
            memory_scope="platform"
        )
        normal_response = run_coro(main.interact(req_normal, MockRequest()))
        assert normal_response["response_text"] == "Mocked response text"
        assert normal_response["platform_id"] == "education-platform"
        assert normal_response["memory_scope"] == "platform"
        print("✓ Non-streaming interaction endpoint operational.")

def test_preferences_and_platforms():
    print("\n--- Test: Platforms & Preferences Endpoints ---")
    test_user = "ankit_user"

    # Platforms list
    p_resp = run_coro(main.list_user_platforms(
        user_id=test_user,
        raw_req=MockRequest(FIRST_PARTY_HEADERS),
        requesting_platform_id="axiom-web"
    ))
    platforms = p_resp["platforms"]
    assert "axiom-web" in platforms
    print(f"✓ Platforms endpoint returned: {platforms}")

    # Preferences
    pref_resp = run_coro(main.get_preferences(
        user_id=test_user,
        raw_req=MockRequest(FIRST_PARTY_HEADERS),
        platform_id="axiom-web"
    ))
    prefs = pref_resp["preferences"]
    assert "platform_topics" in prefs
    assert "global_topics" in prefs
    assert "top_topics" in prefs
    print(f"✓ Preferences endpoint returned separated topic scopes.")

if __name__ == "__main__":
    test_health()
    test_first_party_authentication_and_credentials()
    test_permission_api_security()
    test_deletion_scope_and_isolation()
    test_interaction_endpoints()
    test_preferences_and_platforms()
    print("\nALL STAGE 4 API TESTS PASSED SUCCESSFULLY! 🚀")
