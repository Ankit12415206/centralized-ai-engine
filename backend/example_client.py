"""
Example second-platform client — run after starting the backend.
Usage:
  1. Set environment variable:
     - Linux/macOS: export EDUCATION_PLATFORM_KEY="<your-key>"
     - Windows PowerShell: $env:EDUCATION_PLATFORM_KEY="<your-key>"
     (Or define in backend/.env)
  2. Run: python example_client.py
"""
import os
import requests
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

ENGINE_URL = os.getenv("ENGINE_URL", "http://localhost:8000")
PLATFORM_KEY = os.getenv("EDUCATION_PLATFORM_KEY")

def ask(message, platform_id="education-platform", user_id="student-001", session_id=None, language="en", platform_key=None):
    active_key = platform_key if platform_key is not None else PLATFORM_KEY
    if not active_key:
        raise ValueError(
            "Missing platform credential: EDUCATION_PLATFORM_KEY environment variable is not set.\n"
            "Please configure EDUCATION_PLATFORM_KEY in your environment or backend/.env before running."
        )

    payload = {
        "platform_id": platform_id,
        "user_id": user_id,
        "message": message,
        "language": language,
        "session_id": session_id,
    }
    headers = {
        "Content-Type": "application/json",
        "X-Platform-Key": active_key,
    }
    r = requests.post(f"{ENGINE_URL}/api/interact", json=payload, headers=headers)
    if r.status_code != 200:
        raise RuntimeError(f"Request failed ({r.status_code}): {r.text}")
    return r.json()

if __name__ == "__main__":
    print("=== Education Platform → Centralized AI Engine ===")
    try:
        r1 = ask("What is machine learning?", "education-platform", "student-001")
        print(f"\n[Student]: What is machine learning?")
        print(f"[AI]: {r1.get('response_text')}")
        session = r1.get("session_id")

        r2 = ask("Give me a simple example", "education-platform", "student-001", session_id=session)
        print(f"\n[Student]: Give me a simple example")
        print(f"[AI]: {r2.get('response_text')}")
        print(f"Context used: {r2.get('context_used')}")

        r3 = ask("यह कैसे काम करता है?", "education-platform", "student-001", session_id=session, language="hi")
        print(f"\n[Student (Hindi)]: यह कैसे काम करता है?")
        print(f"[AI (Hindi)]: {r3.get('response_text')}")
    except Exception as e:
        print(f"Client execution failed: {e}")
