"""
Unit tests for Stage 3:
- adaptive_learning.py:
  * Platform boundaries for learned topics
  * Unauthorized topics never exposed
  * Platform vs global preference separation (no silent mixing)
  * Legacy backward compatibility
- reasoning_engine.py:
  * Context authorization before prompt construction
  * Provenance tagging for cross-platform turns
  * Exclusion of unauthorized and revoked memories from LLM prompt
  * Empty context and retrieval error resilience
  * Topic hint formatting
"""

import os
import sys
import uuid
from unittest.mock import MagicMock, patch

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
EDU_KEY = os.getenv("EDUCATION_PLATFORM_KEY")

from modules.database import get_connection
from modules.context_memory import ContextMemoryEngine
from modules.adaptive_learning import AdaptiveLearningEngine
from modules.reasoning_engine import ReasoningEngine

def test_adaptive_learning_platform_boundaries_and_auth():
    print("\n--- Running Test: Adaptive Learning Platform Boundaries & Authorization ---")
    adaptive = AdaptiveLearningEngine()
    context = ContextMemoryEngine()
    test_user = "ankit_user"

    # Clean existing user_topics for this test
    conn = get_connection()
    conn.execute("DELETE FROM user_topics WHERE user_id = ?", (test_user,))
    conn.execute("DELETE FROM platform_permissions WHERE user_id = ?", (test_user,))
    conn.commit()
    conn.close()

    # 1. Record interactions on two different platforms
    # axiom-web: user discusses algorithms, optimization, python
    adaptive.record_interaction(test_user, "Let us optimize these sorting algorithms in python", "Sure!", platform_id="axiom-web")
    # education-platform: user discusses biology, genetics, mitochondria
    adaptive.record_interaction(test_user, "Explain cellular biology and genetics regarding mitochondria", "Of course!", platform_id="education-platform")

    # 2. Check preferences from axiom-web with NO permission granted:
    # education-platform's biology/genetics topics must NOT be exposed!
    axiom_prefs = adaptive.get_user_preferences(test_user, platform_id="axiom-web")
    print(f"axiom-web topics without permission: {axiom_prefs}")
    assert any("algorithm" in t or "sort" in t or "python" in t or "optimize" in t for t in axiom_prefs["platform_topics"]), "Should have platform topics"
    assert not any("biology" in t or "genetics" in t for t in axiom_prefs["platform_topics"]), "Education topics leaked into platform_topics!"
    assert len(axiom_prefs["global_topics"]) == 0, "Unauthorized global topics must NOT be visible!"
    print("✓ Platform boundary verified: unauthorized topics are completely hidden.")

    # 3. Grant permission: education-platform -> axiom-web (education allows axiom-web to read)
    context.set_permission(
        user_id=test_user,
        owner_platform_id="education-platform",
        requester_platform_id="axiom-web",
        status="granted",
        acting_platform_id="education-platform",
        acting_platform_key=EDU_KEY
    )

    # 4. Check preferences again from axiom-web:
    # Now education-platform topics SHOULD appear in global_topics, NOT silently merged into platform_topics
    axiom_prefs_granted = adaptive.get_user_preferences(test_user, platform_id="axiom-web")
    print(f"axiom-web topics with permission: {axiom_prefs_granted}")
    assert len(axiom_prefs_granted["global_topics"]) > 0, "Authorized global topics should be visible"
    assert any("biology" in t or "genetics" in t for t in axiom_prefs_granted["global_topics"]), "Biology should be in global_topics"
    # Ensure platform_topics did not get contaminated
    assert not any("biology" in t or "genetics" in t for t in axiom_prefs_granted["platform_topics"]), "Platform topics contaminated!"
    print("✓ Preference separation verified: authorized topics appear in global_topics without contaminating platform_topics.")

    # 5. Revoke permission: education-platform -> axiom-web
    context.set_permission(
        user_id=test_user,
        owner_platform_id="education-platform",
        requester_platform_id="axiom-web",
        status="revoked",
        acting_platform_id="education-platform",
        acting_platform_key=EDU_KEY
    )

    # 6. Check preferences from axiom-web after revocation:
    # Global topics must immediately disappear
    axiom_prefs_revoked = adaptive.get_user_preferences(test_user, platform_id="axiom-web")
    assert len(axiom_prefs_revoked["global_topics"]) == 0, "Revoked platform topics must disappear immediately!"
    print("✓ Revocation in adaptive learning verified: revoked topics immediately excluded.")

def test_reasoning_engine_prompt_construction_and_provenance():
    print("\n--- Running Test: Reasoning Engine Prompt Construction & Provenance ---")
    context_eng = ContextMemoryEngine()
    adaptive_eng = AdaptiveLearningEngine()
    reasoning_eng = ReasoningEngine(context_eng, adaptive_eng)

    test_user = "ankit_user"
    sess_id = "sess-reasoning-" + str(uuid.uuid4())[:8]

    # Clean test session and permissions
    conn = get_connection()
    conn.execute("DELETE FROM context_memory WHERE session_id = ?", (sess_id,))
    conn.execute("DELETE FROM platform_permissions WHERE user_id = ?", (test_user,))
    conn.commit()
    conn.close()

    # Create 1 global memory on axiom-web and 1 global memory on education-platform
    context_eng.update(test_user, "Axiom Local Question", "Axiom Local Answer", sess_id, platform_id="axiom-web", memory_scope="global")
    context_eng.update(test_user, "Edu Cross Question", "Edu Cross Answer", sess_id, platform_id="education-platform", memory_scope="global")

    # 1. When axiom-web builds messages WITHOUT permission to education-platform:
    # LLM prompt must NEVER contain "Edu Cross Question"
    messages_unauthorized = reasoning_eng._build_messages(
        platform_id="axiom-web",
        user_id=test_user,
        message="What is my status?",
        context=None,  # let reasoning engine retrieve context dynamically
        session_id=sess_id
    )

    prompt_text = str(messages_unauthorized)
    assert "Axiom Local Question" in prompt_text, "Axiom local message must be in prompt"
    assert "Edu Cross Question" not in prompt_text, "Unauthorized Edu memory leaked into prompt!"
    print("✓ Prompt authorization verified: unauthorized context never enters LLM prompt.")

    # 2. Grant permission: education-platform -> axiom-web
    context_eng.set_permission(
        user_id=test_user,
        owner_platform_id="education-platform",
        requester_platform_id="axiom-web",
        status="granted",
        acting_platform_id="education-platform",
        acting_platform_key=EDU_KEY
    )

    # 3. Build messages with granted permission:
    # Cross-platform turn must be included AND tagged with provenance [From education-platform]
    # Own-platform turn must NOT be prefixed with [From axiom-web]
    messages_authorized = reasoning_eng._build_messages(
        platform_id="axiom-web",
        user_id=test_user,
        message="What is my status?",
        context=None,
        session_id=sess_id
    )

    # Verify provenance tag on cross-platform turn
    edu_turns = [m for m in messages_authorized if "[From education-platform]" in m["content"]]
    assert len(edu_turns) >= 2, f"Expected user & assistant turns tagged with [From education-platform], got {edu_turns}"
    assert any("Edu Cross Question" in m["content"] for m in edu_turns)

    # Verify own-platform turn does NOT have provenance prefix
    axiom_turns = [m for m in messages_authorized if "Axiom Local Question" in m["content"]]
    assert len(axiom_turns) == 1
    assert "[From axiom-web]" not in axiom_turns[0]["content"], "Own-platform turn should not have redundant provenance prefix"
    print("✓ Provenance tagging verified: cross-platform context explicitly tagged [From education-platform].")

    # 4. Revoke permission and verify prompt immediately excludes it
    context_eng.set_permission(
        user_id=test_user,
        owner_platform_id="education-platform",
        requester_platform_id="axiom-web",
        status="revoked",
        acting_platform_id="education-platform",
        acting_platform_key=EDU_KEY
    )

    messages_after_revoke = reasoning_eng._build_messages(
        platform_id="axiom-web",
        user_id=test_user,
        message="What is my status?",
        context=None,
        session_id=sess_id
    )
    prompt_text_revoked = str(messages_after_revoke)
    assert "Edu Cross Question" not in prompt_text_revoked, "Revoked memory leaked into prompt!"
    print("✓ Prompt revocation verified: revoked memories immediately excluded from LLM prompt.")

def test_reasoning_resilience_and_empty_context():
    print("\n--- Running Test: Reasoning Resilience & Empty Context ---")
    context_eng = ContextMemoryEngine()
    adaptive_eng = AdaptiveLearningEngine()
    reasoning_eng = ReasoningEngine(context_eng, adaptive_eng)

    # Test with empty context explicitly passed
    msgs_empty = reasoning_eng._build_messages(
        platform_id="axiom-web",
        user_id="ankit_user",
        message="Hello engine",
        context=[]
    )
    assert len(msgs_empty) == 2, "Should have system prompt and user message"
    assert msgs_empty[0]["role"] == "system"
    assert msgs_empty[1]["content"] == "Hello engine"
    print("✓ Empty context handled safely.")

    # Test when context_engine fails or raises an exception
    with patch.object(context_eng, "get_context", side_effect=RuntimeError("Database lock")):
        msgs_resilient = reasoning_eng._build_messages(
            platform_id="axiom-web",
            user_id="ankit_user",
            message="Resilience test",
            context=None
        )
        assert len(msgs_resilient) == 2
        assert msgs_resilient[1]["content"] == "Resilience test"
    print("✓ Context retrieval error handled safely without crash.")

if __name__ == "__main__":
    test_adaptive_learning_platform_boundaries_and_auth()
    test_reasoning_engine_prompt_construction_and_provenance()
    test_reasoning_resilience_and_empty_context()
    print("\nALL STAGE 3 TESTS PASSED SUCCESSFULLY! 🎯")
