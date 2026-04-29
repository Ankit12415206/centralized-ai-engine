"""
Example second-platform client — run after starting the backend.
Usage: python example_client.py
"""
import requests

ENGINE_URL = "http://localhost:8000"

def ask(message, platform_id, user_id, session_id=None, language="en"):
    r = requests.post(f"{ENGINE_URL}/api/interact", json={
        "platform_id": platform_id,
        "user_id": user_id,
        "message": message,
        "language": language,
        "session_id": session_id,
    })
    return r.json()

print("=== Education Platform → Centralized AI Engine ===")
r1 = ask("What is machine learning?", "education-platform", "student-001")
print(f"\n[Student]: What is machine learning?")
print(f"[AI]: {r1['response_text']}")
session = r1["session_id"]

r2 = ask("Give me a simple example", "education-platform", "student-001", session_id=session)
print(f"\n[Student]: Give me a simple example")
print(f"[AI]: {r2['response_text']}")
print(f"Context used: {r2['context_used']}")

r3 = ask("यह कैसे काम करता है?", "education-platform", "student-001", session_id=session, language="hi")
print(f"\n[Student (Hindi)]: यह कैसे काम करता है?")
print(f"[AI (Hindi)]: {r3['response_text']}")