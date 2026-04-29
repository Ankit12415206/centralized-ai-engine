"""
Central Reasoning Engine - with streaming support
"""

import os
from typing import Optional, Tuple, List, Generator
from dotenv import load_dotenv

from modules.context_memory import ContextMemoryEngine
from modules.adaptive_learning import AdaptiveLearningEngine

load_dotenv()


class ReasoningEngine:
    def __init__(self, context_engine: ContextMemoryEngine, adaptive_engine: AdaptiveLearningEngine):
        self.context_engine = context_engine
        self.adaptive_engine = adaptive_engine
        self._client = None
        self.model = os.getenv("LLM_MODEL", "gpt-4o-mini")

    @property
    def client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(
                api_key=os.getenv("OPENAI_API_KEY", "ollama"),
                base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            )
        return self._client

    def _build_messages(self, platform_id, user_id, message, context, image_base64=None):
        style = self.adaptive_engine.get_response_style(user_id)
        prefs = self.adaptive_engine.get_user_preferences(user_id)
        topic_hint = ", ".join(prefs["top_topics"]) if prefs["top_topics"] else "general"

        system_prompt = f"""You are a centralized AI engine serving the '{platform_id}' platform.
Provide context-aware, intelligent, and helpful responses.
User's preferred response style: {style}.
User's common topics of interest: {topic_hint}.
IMPORTANT: Respond ONLY in the language identified as '{kwargs.get('target_lang_name', 'English')}'.
Be consistent, accurate, and adapt your tone to the platform context."""

        messages = [{"role": "system", "content": system_prompt}]

        for turn in context:
            messages.append({"role": "user", "content": turn["user"]})
            messages.append({"role": "assistant", "content": turn["assistant"]})

        # Build user content — text only or text + image
        if image_base64:
            user_content = [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{image_base64}",
                        "detail": "auto"
                    }
                },
                {"type": "text", "text": message or "What is in this image?"}
            ]
        else:
            user_content = message

        messages.append({"role": "user", "content": user_content})
        return messages

    def generate_stream(
        self,
        platform_id: str,
        user_id: str,
        message: str,
        context: List[dict],
        target_lang_name: str = "English",
        session_id: Optional[str] = None,
        image_base64: Optional[str] = None,
    ) -> Generator:
        """Yields text chunks as they arrive from the LLM."""
        if not session_id:
            session_id = self.context_engine.create_session(user_id)

        # Use vision model if image present
        model = "gpt-4o" if image_base64 else self.model

        messages = self._build_messages(
            platform_id, user_id, message, context, image_base64, 
            target_lang_name=target_lang_name
        )

        stream = self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
            stream=True,
        )

        full_response = ""
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                full_response += delta
                yield delta, session_id, full_response

    def generate(self, platform_id, user_id, message, context, target_lang_name="English", session_id=None, image_base64=None):
        """Non-streaming fallback — collects full response."""
        if not session_id:
            session_id = self.context_engine.create_session(user_id)

        model = "gpt-4o" if image_base64 else self.model
        messages = self._build_messages(
            platform_id, user_id, message, context, image_base64,
            target_lang_name=target_lang_name
        )

        response = self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
        )
        text = response.choices[0].message.content
        confidence = 0.95 if response.choices[0].finish_reason == "stop" else 0.70
        return text, confidence, session_id