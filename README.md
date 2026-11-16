# AXIOM AI — Centralized Core Artificial Intelligence Engine

A Centralized Core Artificial Intelligence Engine with Cross-Platform Memory Governance, SQL Permission Gating, Selective Context Retrieval, Multilingual Processing, and Adaptive Learning.

---

## 1. Overview & Problem Addressed

Modern multi-application ecosystems suffer from severe **intelligence and memory fragmentation**:
- An organization or user interacts across multiple distinct client platforms (e.g., a primary web portal, a learning management system, a mobile assistant).
- Each platform traditionally operates its own siloed context and duplicate AI runtime, leading to redundant computation, inconsistent cross-platform behavior, and fragmented personalization.
- Conversely, naive un-gated memory sharing creates severe privacy and security risks by leaking platform-specific configurations or confidential credentials to third-party clients.

**AXIOM AI** decouples the core intelligence engine from individual client platforms. It centralizes reasoning, conversation history, and adaptive learning while enforcing **zero-trust, owner-authorized cross-platform memory isolation directly at the database layer**.

---

## 2. Key Architecture & Modules

```
                    ┌────────────────────────────────────────────────────────┐
                    │                   Client Layer                         │
                    │   AXIOM Web Portal          Third-Party Platforms      │
                    │   (First-Party UI)          (e.g., Education Platform) │
                    └──────────┬─────────────────────────────┬───────────────┘
                               │                             │
                     HTTP / SSE (First-Party)     HTTP / REST (X-Platform-Key)
                               │                             │
                    ┌──────────▼─────────────────────────────▼───────────────┐
                    │               FastAPI Central Gateway                  │
                    │      (Identity Validation & Authentication Gate)       │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
             ┌─────────────────────────────────┼─────────────────────────────────┐
             │                                 │                                 │
    ┌────────▼──────────────┐       ┌──────────▼──────────────┐       ┌──────────▼──────────────┐
    │ Multilingual Module   │       │ Context Memory Engine   │       │ Adaptive Learning       │
    │ (Detect & Translate)  │       │ (SQL Authorization Gate)│       │ (Scoped Topic Tracking) │
    └────────┬──────────────┘       └──────────┬──────────────┘       └──────────┬──────────────┘
             │                                 │                                 │
             └─────────────────────────────────┼─────────────────────────────────┘
                                               │
                                    ┌──────────▼──────────────┐
                                    │ Central Reasoning Engine│
                                    │ (Provenance Injection)  │
                                    └──────────┬──────────────┘
                                               │
                                    ┌──────────▼──────────────┐
                                    │ Local LLM Backend       │
                                    │ (Ollama / Llama 3)      │
                                    └─────────────────────────┘
```

The system comprises seven decoupled backend modules and a reactive frontend:

1. **`main.py` (FastAPI Gateway):**
   Exposes streaming (Server-Sent Events) and REST endpoints. Enforces pre-shared platform credentials, verifies user registration mappings, resolves first-party browser origins, and dispatches requests.
2. **`modules/database.py` (Persistence & Integrity Layer):**
   Manages SQLite connections, handles idempotent migrations with automated SHA-256 backup verification, seeds default platforms, and validates platform/user identities.
3. **`modules/context_memory.py` (Cross-Platform Context Engine):**
   Executes SQL-level authorization gating. Platform-local memories are strictly isolated to their originating platform. Global memories are shared across platforms **only** when an active `status = 'granted'` permission exists. Also handles scoped memory purges (`platform`, `global`, or `all`).
4. **`modules/adaptive_learning.py` (Preference Engine):**
   Extracts user topic interests and attributes them strictly to the originating platform. Evaluates cross-platform topic sharing based on permissions and structures preferences into priority tiers.
5. **`modules/reasoning_engine.py` (LLM Dispatcher & Provenance):**
   Injects authorized context turns into the prompt. Appends explicit provenance tags (e.g., `[From education-platform]`) to cross-platform context turns so the model understands data lineage.
6. **`modules/multilingual.py` (Language Processor):**
   Detects input language via `langdetect` and normalizes text for reasoning using `deep-translator`.
7. **`modules/voice_processor.py` (Audio Processing):**
   Provides Text-to-Speech (via `gTTS`) and Speech-to-Text (via `SpeechRecognition` and `pydub`).
8. **`frontend/` (AXIOM React Dashboard & Chat):**
   Built with React 18, Vite, TailwindCSS, and Framer Motion. Provides a chat interface with memory scope toggles (`Global` vs. `Private`), live Server-Sent Events token streaming, and an intelligence dashboard for platform audit, permissions governance, and scoped data purging.

---

## 3. Database Schema

The persistence layer (`backend/ai_engine.db`) defines **6 application domain tables** (plus SQLite's internal `sqlite_sequence` tracking table):

### Table Summary

| Table Name | Primary Key | Key Columns | Purpose |
| :--- | :--- | :--- | :--- |
| **`registered_platforms`** | `platform_id` | `platform_key`, `display_name`, `created_at` | Registry of authorized client platforms and pre-shared secret keys. |
| **`registered_users`** | `(user_id, platform_id)` | `display_name`, `created_at` | Allowlist mapping valid user identities to their registered platforms. |
| **`platform_permissions`** | `id` (AUTOINCREMENT) | `user_id`, `owner_platform_id`, `requester_platform_id`, `status`, `granted_by_platform_id`, `updated_at` | Stores owner-granted permissions (`granted`, `denied`, `revoked`). |
| **`context_memory`** | `id` (AUTOINCREMENT) | `user_id`, `session_id`, `platform_id`, `memory_scope`, `user_msg`, `ai_response`, `timestamp` | Append-only interaction memory with platform ownership and scope (`global` vs `platform`). |
| **`user_topics`** | `(user_id, platform_id, topic)` | `count` | Platform-attributed keyword frequency counts for adaptive learning. |
| **`user_feedback`** | `id` (AUTOINCREMENT) | `user_id`, `score`, `timestamp` | Explicit user satisfaction ratings for response style calibration. |

---

## 4. API Endpoint Reference

### Health & Core Intelligence

| Method | Path | Authentication | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` / `/api/health` | None | Service status and enabled architecture features. |
| `POST` | `/api/interact/stream` | Platform Key / Local Origin | Streams AI response token-by-token via SSE with SQL context gating. |
| `POST` | `/api/interact` | Platform Key / Local Origin | Standard non-streaming REST endpoint for conversational turns. |

### Memory & Session Governance

| Method | Path | Parameters | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/context/{user_id}` | `platform_id`, `platform_key` | Retrieves authorized context memories for a platform. |
| `DELETE` | `/api/context/{user_id}` | `platform_id`, `scope` (`platform`\|`global`\|`all`) | Scoped memory purge (never affects other platforms). |
| `GET` | `/api/sessions/{user_id}` | `platform_id` | Lists past conversational sessions for a user. |
| `GET` | `/api/history/{user_id}/{session_id}` | `platform_id` | Retrieves ordered conversation turns for a session. |
| `GET` | `/api/platforms/{user_id}` | `requesting_platform_id` | Lists registered platforms for a user. |
| `GET` | `/api/preferences/{user_id}` | `platform_id` | Returns scoped adaptive learning topics. |

### Cross-Platform Permissions

| Method | Path | Body / Query | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/permissions/{user_id}` | `requesting_platform_id` | Lists permission rules relevant to the requesting platform. |
| `POST` / `PUT` | `/api/permissions` | `user_id`, `owner_platform_id`, `requester_platform_id`, `status`, `acting_platform_id` | Grants or revokes access (enforces owner authorization and self-grant prevention). |

---

## 5. Getting Started & Installation

### Prerequisites
- Python 3.10+ (Recommended: Python 3.12)
- Node.js 18+ and npm
- Ollama running locally (`http://localhost:11434`) with model `llama3` (`ollama run llama3`)

### Backend Setup
1. Open terminal and navigate to the project root:
   ```powershell
   cd c:\Users\ankit\OneDrive\Desktop\centralized-ai-engine
   ```
2. Activate or create Python virtual environment:
   ```powershell
   # Activate existing virtualenv
   .\backend\venv\Scripts\activate
   ```
3. Install dependencies:
   ```powershell
   pip install -r backend/requirements.txt
   ```
4. Configure environment:
   ```powershell
   # Copy template if backend/.env is not present
   cp backend/.env.example backend/.env
   ```
5. Initialize / Verify SQLite database:
   ```powershell
   python backend/modules/database.py
   ```
6. Start the FastAPI server:
   ```powershell
   python backend/main.py
   ```
   *The backend will be live at `http://localhost:8000` (API docs at `http://localhost:8000/docs`).*

### Frontend Setup
1. In a new terminal, navigate to the `frontend` folder:
   ```powershell
   cd frontend
   npm install
   ```
2. Start the Vite development server:
   ```powershell
   npm run dev
   ```
   *The web client will be accessible at `http://localhost:5173`.*

---

## 6. Live Demonstration Walkthrough (Academic Evaluation)

### Pre-configured Demo Identities
- **First-Party Platform:** `axiom-web` (Web Portal UI, authenticated via local browser context)
- **Third-Party Platform:** `education-platform` (Key loaded securely from environment / `backend/.env`)
- **Primary Demonstration User:** `ankit_user` (registered on both platforms)

### Demonstration Steps (5–7 Minutes):

1. **Store Global vs. Private Memory:**
   - On the Chat page (`http://localhost:5173/`), select **Global Scope** (Globe icon).
   - Prompt: `"My distributed systems project is titled Project Apollo, and our benchmark target is 10,000 RPS."`
   - Switch to **Private Scope** (Lock icon).
   - Prompt: `"For this web editor, set indentation to 4 spaces and dark obsidian theme."`
2. **Verify Default Zero-Trust Isolation:**
   - Navigate to `/dashboard`. Change the platform selector to `education-platform`.
   - Click **Access Data**. Zero memories from `axiom-web` are returned.
3. **Grant Owner Permission:**
   - Switch selector back to `axiom-web` (the data owner).
   - In the **Cross-Platform Memory Permissions** table, locate `education-platform` and click **Grant Access**.
4. **Demonstrate Third-Party Retrieval (API Client):**
   - Execute query as the external LMS client in terminal (credentials passed via `X-Platform-Key` header):
     ```powershell
     # Using PowerShell:
     $EDU_KEY = (Get-Content backend\.env | Where-Object { $_ -match '^EDUCATION_PLATFORM_KEY=' }).Split('=')[1].Trim()
     curl.exe -s -X POST http://localhost:8000/api/interact `
       -H "Content-Type: application/json" `
       -H "X-Platform-Key: $EDU_KEY" `
       -d '{\"platform_id\": \"education-platform\", \"user_id\": \"ankit_user\", \"message\": \"What is the target RPS for my project?\"}'
     ```
   - Alternatively, execute the pre-configured script:
     ```powershell
     python backend/example_client.py
     ```
   - The response cites the benchmark target, tagged with `[From axiom-web]`. Private editor preferences remain strictly excluded.
5. **Demonstrate Immediate Revocation:**
   - On the Dashboard, click **Revoke Access**.
   - Re-run the exact same curl command. The model immediately reports no record of the project target.
6. **Demonstrate Scoped Purge:**
   - Use the **Purge Local** button to erase platform-specific traces without altering global shared knowledge or records on other platforms.

---

## 7. Known Limitations & Technical Tradeoffs

To ensure academic and technical rigor, the prototype's boundaries are explicitly documented:

1. **Platform Authentication vs. User Identity:**
   - Platforms authenticate using symmetric pre-shared keys against `registered_platforms`.
   - The user identity (`user_id`) is asserted by the authenticated platform and validated against an allowlist (`registered_users`). In an enterprise deployment, this would be extended with end-user OAuth 2.0 / OpenID Connect tokens.
2. **Context Prioritization vs. Semantic Reconciliation:**
   - Context ordering prioritizes platform-local memories after cross-platform memories in the LLM prompt. It does not perform semantic arbitration or fact-reconciliation on contradictory statements at the database level.
3. **Environment-Dependent Features:**
   - **TTS (`gTTS`):** Requires outbound internet connectivity to Google Translate.
   - **STT (`SpeechRecognition`):** Requires host `ffmpeg` binary in system PATH.
   - **Multimodal Vision:** The default local Ollama model (`llama3`) is text-only. Visual reasoning requires a vision-capable model (e.g., `llama3.2-vision` or `llava`).
