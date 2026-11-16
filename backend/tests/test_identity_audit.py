"""
Identity Binding Audit Test Suite:
1. Cross-platform user boundary verification (Platform cannot assert users not registered with it)
2. Intra-platform user impersonation test (Simulating Alice attempting to access Bob's memories on the same platform)
3. Platform authentication vs User authentication distinction
4. Documentation of prototype identity model limitations for CA presentation
"""

import os
import sys
import uuid

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
EDU_KEY = os.getenv("EDUCATION_PLATFORM_KEY")

from modules.database import get_connection, validate_identity
from modules.context_memory import ContextMemoryEngine

def test_identity_binding_audit():
    print("\n--- Running Identity Binding Audit Tests ---")
    engine = ContextMemoryEngine()
    conn = get_connection()
    c = conn.cursor()

    # Setup test users:
    # Alice and Bob on axiom-web
    # Charlie ONLY on education-platform
    now = "2026-11-13T12:00:00"
    c.execute("INSERT OR IGNORE INTO registered_users VALUES (?,?,?,?)", ("alice_demo", "axiom-web", "Alice", now))
    c.execute("INSERT OR IGNORE INTO registered_users VALUES (?,?,?,?)", ("bob_demo", "axiom-web", "Bob", now))
    c.execute("INSERT OR IGNORE INTO registered_users VALUES (?,?,?,?)", ("charlie_edu", "education-platform", "Charlie", now))
    conn.commit()

    # Seed Bob's private memories on axiom-web
    bob_session = "sess-bob-" + str(uuid.uuid4())[:8]
    engine.update("bob_demo", "Bob's private secret note", "Secret noted.", bob_session, platform_id="axiom-web", memory_scope="platform")

    # ── Test 1: Cross-Platform User Boundary (Protected) ─────────────
    # Can education-platform assert Bob's identity to steal his memories?
    valid, msg = validate_identity("education-platform", EDU_KEY, "bob_demo")
    assert not valid, "education-platform should NOT be able to assert Bob because Bob is not registered on education-platform"
    assert msg == "User not registered on this platform"

    edu_ctx = engine.get_context(user_id="bob_demo", platform_id="education-platform")
    assert len(edu_ctx) == 0, "education-platform MUST receive empty context for a user not registered on it"
    print("✓ Cross-Platform Boundary: Platforms cannot query memories for users not registered under them.")

    # ── Test 2: Intra-Platform User Impersonation (Current Limitation) ─
    # Alice and Bob are both registered on axiom-web.
    # Alice makes an API call on axiom-web claiming user_id='bob_demo'.
    # Because identity is currently asserted by the client without an individual user session/password:
    valid_bob_on_axiom, _ = validate_identity("axiom-web", "axiom-secret-key-2026", "bob_demo")
    assert valid_bob_on_axiom, "Backend validates that bob_demo is a valid user on axiom-web"

    # Since no individual user session token exists, querying with bob_demo returns Bob's memories!
    retrieved_as_bob = engine.get_context(user_id="bob_demo", session_id=bob_session, platform_id="axiom-web")
    assert len(retrieved_as_bob) == 1, "Currently returns Bob's memory because user_id was set to bob_demo"
    assert retrieved_as_bob[0]["user"] == "Bob's private secret note"
    print("! Intra-Platform Impersonation Confirmed: On the same platform, changing user_id retrieves that user's data.")
    print("  -> Finding: The system authenticates the PLATFORM (via platform_key), but TRUSTS the platform's assertion of user_id.")

    # ── Test 3: Permission Gating Bound to Platform Ownership ─────────
    # Can education-platform grant access to Bob's memories?
    try:
        engine.set_permission(
            user_id="bob_demo",
            owner_platform_id="axiom-web",
            requester_platform_id="education-platform",
            status="granted",
            acting_platform_id="education-platform",
            acting_platform_key=EDU_KEY
        )
        assert False, "Should fail non-owner grant"
    except PermissionError as e:
        print(f"✓ Permission Gating Verified: Non-owner platform cannot manage permissions: {e}")

    conn.close()

if __name__ == "__main__":
    test_identity_binding_audit()
    print("\nIDENTITY BINDING AUDIT COMPLETED SUCCESSFULLY! 📋")
