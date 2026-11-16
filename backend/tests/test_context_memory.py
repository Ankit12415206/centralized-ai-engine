"""
Unit tests for context_memory.py:
- B1: Self-grant prevention
- B2: Non-owner grant rejection
- C1: Platform-local memory never shared (even if granted)
- C2: Default isolation (no permissions)
- C3: Authorized cross-platform global memory sharing
- C4: Bidirectional independence
- D1: Immediate revocation effect
- D2: Re-grant after revocation
- E1: Conflict handling and platform precedence
- Edge Cases: Empty results, nonexistent users/platforms
- Backward Compatibility: Existing rows, 4-argument update, legacy context dict format
"""

import os
import sys
import sqlite3
import tempfile
import uuid
from dotenv import load_dotenv

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
EDU_KEY = os.getenv("EDUCATION_PLATFORM_KEY")

from modules.database import get_connection, init_db, migrate_db
from modules.context_memory import ContextMemoryEngine

def test_backward_compatibility_and_preservation():
    print("\n--- Running Test: Backward Compatibility and Existing Records ---")
    engine = ContextMemoryEngine()

    # Verify existing records for ankit_user
    ctx = engine.get_context(user_id="ankit_user")
    assert isinstance(ctx, list), "Context should be a list"
    assert len(ctx) >= 1, "Should have existing records for ankit_user"
    
    # Check dictionary keys for legacy caller compatibility
    first = ctx[0]
    assert "user" in first, "Must contain 'user' key"
    assert "assistant" in first, "Must contain 'assistant' key"
    assert "timestamp" in first, "Must contain 'timestamp' key"
    assert "session_id" in first, "Must contain 'session_id' key"
    assert "platform_id" in first, "Must contain 'platform_id' key"
    assert "memory_scope" in first, "Must contain 'memory_scope' key"

    # Test 4-argument update (legacy signature)
    test_session = str(uuid.uuid4())
    engine.update("ankit_user", "test question backward-compat", "test answer backward-compat", test_session)
    
    # Verify it was added with default platform_id='axiom-web' and memory_scope='global'
    recent = engine.get_context(user_id="ankit_user", session_id=test_session)
    assert len(recent) == 1, "Should retrieve newly added memory"
    assert recent[0]["platform_id"] == "axiom-web"
    assert recent[0]["memory_scope"] == "global"
    assert recent[0]["user"] == "test question backward-compat"

    # Test get_sessions and get_user_profile
    sessions = engine.get_sessions("ankit_user")
    assert any(s["session_id"] == test_session for s in sessions), "Session should be listed"

    profile = engine.get_user_profile("ankit_user")
    assert profile["total_interactions"] >= 1

    print("✓ Backward compatibility verified: legacy signatures and existing records work.")

def test_b1_b2_permissions_authorization():
    print("\n--- Running Tests B1 & B2: Permission Authorization ---")
    engine = ContextMemoryEngine()
    test_user = "ankit_user"

    # Test B1: Self-grant prevention
    try:
        engine.set_permission(
            user_id=test_user,
            owner_platform_id="axiom-web",
            requester_platform_id="axiom-web",
            status="granted",
            acting_platform_id="axiom-web"
        )
        assert False, "Self-grant should have raised ValueError"
    except ValueError as e:
        assert "cannot grant itself permissions" in str(e)
        print(f"✓ Test B1 PASSED: Self-grant rejected with: {e}")

    # Test B2: Non-owner grant rejection
    try:
        engine.set_permission(
            user_id=test_user,
            owner_platform_id="axiom-web",
            requester_platform_id="education-platform",
            status="granted",
            acting_platform_id="education-platform",
            acting_platform_key=EDU_KEY
        )
        assert False, "Non-owner grant should have raised PermissionError"
    except PermissionError as e:
        assert "not authorized to manage permissions for owner" in str(e)
        print(f"✓ Test B2 PASSED: Non-owner grant rejected with: {e}")

    # Test Unauthenticated / Invalid Acting Platform
    try:
        engine.set_permission(
            user_id=test_user,
            owner_platform_id="education-platform",
            requester_platform_id="axiom-web",
            status="granted",
            acting_platform_id="education-platform",
            acting_platform_key="wrong-secret-key"
        )
        assert False, "Invalid credentials should have raised PermissionError"
    except PermissionError as e:
        assert "Authentication failed" in str(e)
        print(f"✓ Invalid credentials for acting platform correctly rejected: {e}")

def test_c2_c1_c3_c4_memory_isolation_and_sharing():
    print("\n--- Running Tests C1, C2, C3, C4: Memory Isolation & Sharing ---")
    engine = ContextMemoryEngine()
    test_user = "ankit_user"
    sess_axiom = "sess-axiom-" + str(uuid.uuid4())[:8]
    sess_edu = "sess-edu-" + str(uuid.uuid4())[:8]

    # Reset any existing permissions between axiom-web and education-platform for this test
    conn = get_connection()
    conn.execute("DELETE FROM platform_permissions WHERE user_id = ?", (test_user,))
    conn.commit()
    conn.close()

    # Seed test memories:
    # axiom-web: 2 global, 1 platform-scoped
    engine.update(test_user, "Axiom Global Msg 1", "Axiom Resp 1", sess_axiom, platform_id="axiom-web", memory_scope="global")
    engine.update(test_user, "Axiom Global Msg 2", "Axiom Resp 2", sess_axiom, platform_id="axiom-web", memory_scope="global")
    engine.update(test_user, "Axiom Private Msg", "Axiom Private Resp", sess_axiom, platform_id="axiom-web", memory_scope="platform")

    # education-platform: 2 global
    engine.update(test_user, "Edu Global Msg 1", "Edu Resp 1", sess_edu, platform_id="education-platform", memory_scope="global")
    engine.update(test_user, "Edu Global Msg 2", "Edu Resp 2", sess_edu, platform_id="education-platform", memory_scope="global")

    # ── Test C2: Default Isolation (No permissions granted) ───────────
    # education-platform queries context: should only see its own 2 messages
    edu_ctx = engine.get_context(test_user, session_id=sess_edu, platform_id="education-platform")
    assert len(edu_ctx) == 2, f"Expected 2 own messages, got {len(edu_ctx)}"
    assert all(m["platform_id"] == "education-platform" for m in edu_ctx)
    print("✓ Test C2 PASSED: Default isolation holds; education-platform sees only its own memories.")

    # ── Test C3 & C1: Grant permission: axiom-web -> education-platform ──
    # axiom-web (owner) grants access to education-platform (requester)
    grant_res = engine.set_permission(
        user_id=test_user,
        owner_platform_id="axiom-web",
        requester_platform_id="education-platform",
        status="granted",
        acting_platform_id="axiom-web"
    )
    assert grant_res["status"] == "granted"

    # Query education-platform context without session filter (cross-session)
    edu_ctx_shared = engine.get_context(test_user, platform_id="education-platform")
    shared_msgs = [m["user"] for m in edu_ctx_shared]
    
    # Must include axiom-web's global messages (Test C3)
    assert "Axiom Global Msg 1" in shared_msgs, "Expected Axiom Global Msg 1 to be shared"
    assert "Axiom Global Msg 2" in shared_msgs, "Expected Axiom Global Msg 2 to be shared"
    print("✓ Test C3 PASSED: Authorized global memories successfully shared across platforms.")

    # Must NOT include axiom-web's platform-scoped message (Test C1)
    assert "Axiom Private Msg" not in shared_msgs, "Platform-scoped memory must NEVER be shared!"
    print("✓ Test C1 PASSED: Platform-local memory is strictly isolated and never shared.")

    # ── Test C4: Bidirectional Independence ───────────────────────────
    # axiom-web queries its context: should NOT see education-platform's memories
    # because education-platform never granted permission to axiom-web
    axiom_ctx = engine.get_context(test_user, platform_id="axiom-web")
    axiom_msgs = [m["user"] for m in axiom_ctx]
    assert "Edu Global Msg 1" not in axiom_msgs, "Unidirectional grant should not leak in reverse"
    assert "Edu Global Msg 2" not in axiom_msgs, "Unidirectional grant should not leak in reverse"
    print("✓ Test C4 PASSED: Bidirectional independence verified (no reverse leakage).")

def test_d1_d2_revocation():
    print("\n--- Running Tests D1 & D2: Permission Revocation ---")
    engine = ContextMemoryEngine()
    test_user = "ankit_user"

    # Ensure permission is currently granted
    engine.set_permission(
        user_id=test_user,
        owner_platform_id="axiom-web",
        requester_platform_id="education-platform",
        status="granted",
        acting_platform_id="axiom-web"
    )
    # Check that education-platform sees axiom-web global messages
    ctx_before = engine.get_context(test_user, platform_id="education-platform")
    assert any(m["platform_id"] == "axiom-web" for m in ctx_before), "Should see axiom-web memories when granted"

    # ── Test D1: Revocation ───────────────────────────────────────────
    revoke_res = engine.set_permission(
        user_id=test_user,
        owner_platform_id="axiom-web",
        requester_platform_id="education-platform",
        status="revoked",
        acting_platform_id="axiom-web"
    )
    assert revoke_res["status"] == "revoked"

    # Immediate retrieval attempt
    ctx_after = engine.get_context(test_user, platform_id="education-platform")
    assert not any(m["platform_id"] == "axiom-web" for m in ctx_after), "Revoked memories must immediately disappear!"
    print("✓ Test D1 PASSED: Immediate revocation verified; revoked memories excluded on next call.")

    # ── Test D2: Re-grant After Revocation ────────────────────────────
    engine.set_permission(
        user_id=test_user,
        owner_platform_id="axiom-web",
        requester_platform_id="education-platform",
        status="granted",
        acting_platform_id="axiom-web"
    )
    ctx_regranted = engine.get_context(test_user, platform_id="education-platform")
    assert any(m["platform_id"] == "axiom-web" for m in ctx_regranted), "Re-granted memories must immediately reappear"
    print("✓ Test D2 PASSED: Re-grant restores access immediately.")

def test_e1_conflict_handling_precedence():
    print("\n--- Running Test E1: Conflict Handling & Platform Precedence ---")
    engine = ContextMemoryEngine()
    test_user = "ankit_user"
    sess = "sess-conflict-" + str(uuid.uuid4())[:8]

    # Clean test session
    # Store conflicting preferences
    # axiom-web: User prefers concise bullet points
    engine.update(test_user, "I prefer concise bullet points", "Understood.", sess, platform_id="axiom-web", memory_scope="global")
    # education-platform: User prefers detailed step-by-step academic explanations
    engine.update(test_user, "I prefer detailed step-by-step academic explanations", "Noted.", sess, platform_id="education-platform", memory_scope="global")

    # Grant permission: axiom-web -> education-platform
    engine.set_permission(
        user_id=test_user,
        owner_platform_id="axiom-web",
        requester_platform_id="education-platform",
        status="granted",
        acting_platform_id="axiom-web"
    )

    # When education-platform retrieves context:
    # Both conflicting messages must be preserved (neither deleted/overwritten)
    # The order must place cross-platform (axiom-web) FIRST, and own-platform (education-platform) LAST
    ctx = engine.get_context(test_user, session_id=sess, platform_id="education-platform")
    assert len(ctx) == 2, f"Both conflicting memories must be preserved, got {len(ctx)}"

    first_msg = ctx[0]
    second_msg = ctx[1]

    assert first_msg["platform_id"] == "axiom-web", "Cross-platform background context must come first"
    assert second_msg["platform_id"] == "education-platform", "Own-platform direct context must come last (precedence)"
    print("✓ Test E1 PASSED: Conflicting memories preserved; own-platform context takes precedence.")

def test_edge_cases():
    print("\n--- Running Edge Cases: Empty Results & Nonexistent Entities ---")
    engine = ContextMemoryEngine()

    # Nonexistent user
    ctx_empty_user = engine.get_context("nonexistent_user_xyz", platform_id="axiom-web")
    assert ctx_empty_user == [], f"Expected empty list for nonexistent user, got {ctx_empty_user}"
    print("✓ Nonexistent user context returns empty list")

    # User not registered on platform (cross-user isolation)
    # student-001 is only registered on education-platform, NOT on axiom-web
    ctx_unregistered_user = engine.get_context("student-001", platform_id="axiom-web")
    assert ctx_unregistered_user == [], f"Expected empty list for unregistered user on platform, got {ctx_unregistered_user}"
    print("✓ Unregistered user on platform correctly returns empty context")

    # Nonexistent platform
    ctx_empty_platform = engine.get_context("ankit_user", platform_id="nonexistent_platform_abc")
    assert ctx_empty_platform == [], f"Expected empty list for nonexistent platform, got {ctx_empty_platform}"
    print("✓ Nonexistent platform context returns empty list")

    # Nonexistent user permissions
    perms_empty = engine.get_permissions("nonexistent_user_xyz")
    assert perms_empty == [], f"Expected empty perms list for nonexistent user, got {perms_empty}"
    print("✓ Nonexistent user permissions returns empty list")

    # Permission for nonexistent requester platform
    try:
        engine.set_permission(
            user_id="ankit_user",
            owner_platform_id="axiom-web",
            requester_platform_id="phantom-platform",
            status="granted",
            acting_platform_id="axiom-web"
        )
        assert False, "Should raise ValueError for phantom requester platform"
    except ValueError as e:
        assert "not a registered platform" in str(e)
        print(f"✓ Nonexistent requester platform correctly rejected: {e}")

    # Invalid status
    try:
        engine.set_permission(
            user_id="ankit_user",
            owner_platform_id="axiom-web",
            requester_platform_id="education-platform",
            status="unrecognized_status",
            acting_platform_id="axiom-web"
        )
        assert False, "Should raise ValueError for invalid status"
    except ValueError as e:
        assert "Invalid status" in str(e)
        print(f"✓ Invalid permission status correctly rejected: {e}")

if __name__ == "__main__":
    test_backward_compatibility_and_preservation()
    test_b1_b2_permissions_authorization()
    test_c2_c1_c3_c4_memory_isolation_and_sharing()
    test_d1_d2_revocation()
    test_e1_conflict_handling_precedence()
    test_edge_cases()
    print("\nALL STAGE 2 CONTEXT MEMORY TESTS PASSED! 🚀")
