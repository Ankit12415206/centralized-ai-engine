# Centralized Core AI Engine

## Overview
**Title:** A Centralized Core Artificial Intelligence Engine with Voice, Multilingual Interaction, Context Memory, and Adaptive Learning.

This project implements a centralized AI engine designed to provide context-aware intelligence services to multiple independent client platforms. By decoupling the AI logic from individual applications, this system reduces redundant computation, ensures consistent behavior, and lowers infrastructure costs.

## Key Features
- **Centralized Reasoning:** A unified engine serving multiple platforms (Education, Enterprise, Public Services).
- **Voice Processing:** Integrated Speech-to-Text (STT) and Text-to-Speech (TTS) capabilities.
- **Multilingual Interaction:** Automatic language detection and translation for global accessibility.
- **Context Memory Engine:** Persistent storage of user interactions for long-term understanding and personalization.
- **Adaptive Learning Engine:** Continuously analyzes interactions to improve system performance and adapt to user preferences.

## System Architecture
The engine consists of several specialized modules:
- **Request Ingestion:** Handles incoming messages from various platforms.
- **Context Interpretation:** Retrieves historical data to provide situational awareness.
- **Central Reasoning:** Processes requests using state-of-the-art LLMs (OpenAI/Ollama).
- **Response Generation:** Formulates intelligent, personalized responses.
- **Response Delivery:** Delivers responses via streaming (SSE) or standard REST API.

## Technical Stack
- **Backend:** Python, FastAPI, SQLite, OpenAI/Ollama, gTTS, SpeechRecognition.
- **Frontend:** React, Vite, TailwindCSS, Lucide Icons.

## Getting Started

### Backend Setup
1. Navigate to the `backend` directory.
2. Install dependencies: `pip install -r requirements.txt`.
3. Set up your `.env` file with `OPENAI_API_KEY` and `OPENAI_BASE_URL`.
4. Initialize the database: `python modules/database.py`.
5. Start the server: `python main.py`.

### Frontend Setup
1. Navigate to the `frontend` directory.
2. Install dependencies: `npm install`.
3. Start the development server: `npm run dev`.

## Invention Disclosure Details
- **Inventors:** Ankit, Bhavna
- **Institution:** Lovely Professional University, Punjab, India
- **Problem Addressed:** Redundant AI logic across multiple applications, high infrastructure costs, and inconsistent cross-platform behavior.
- **Novelty:** Decoupling intelligence processing from client platforms through a centralized, voice-enabled, multilingual architecture.

---
*This project is based on a patent filing for a Centralized Core AI Engine.*
