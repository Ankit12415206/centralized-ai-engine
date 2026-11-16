"""
Central Reasoning Engine - with streaming support
Enforces context authorization before LLM prompt construction,
attaches memory provenance tags, and supports Ollama/OpenAI backends.
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
        self.model = os.getenv("LLM_MODEL", "llama3")

    @property
    def client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(
                api_key=os.getenv("OPENAI_API_KEY", "ollama"),
                base_url=os.getenv("OPENAI_BASE_URL", "http://localhost:11434/v1"),
            )
        return self._client

    def _build_messages(
        self,
        platform_id: str,
        user_id: str,
        message: str,
        context: Optional[List[dict]] = None,
        image_base64: Optional[str] = None,
        session_id: Optional[str] = None,
        **kwargs
    ) -> List[dict]:
        """
        Constructs messages for the LLM prompt.
        Ensures only authorized context is injected and tags cross-platform provenance.
        """
        # Retrieve authorized context dynamically if not supplied
        if context is None:
            try:
                context = self.context_engine.get_context(
                    user_id=user_id,
                    session_id=session_id,
                    platform_id=platform_id
                )
            except Exception as e:
                print(f"[ReasoningEngine] Warning: Context retrieval failed: {e}")
                context = []

        style = self.adaptive_engine.get_response_style(user_id, platform_id=platform_id)
        prefs = self.adaptive_engine.get_user_preferences(user_id, platform_id=platform_id)

        # Build topic provenance hint without silently mixing scopes
        platform_topics = prefs.get("platform_topics", [])
        global_topics = prefs.get("global_topics", [])

        if platform_topics and global_topics:
            topic_hint = f"Platform focus: {', '.join(platform_topics)}; Shared interests: {', '.join(global_topics)}"
        elif platform_topics:
            topic_hint = f"Platform focus: {', '.join(platform_topics)}"
        elif prefs.get("top_topics"):
            topic_hint = ", ".join(prefs["top_topics"])
        else:
            topic_hint = "general"

        target_lang = kwargs.get('target_lang_name', 'English')
        system_prompt = f"""You are a centralized AI engine serving the '{platform_id}' platform.
Provide context-aware, intelligent, and helpful responses.
User's preferred response style: {style}.
User's topics of interest: {topic_hint}.
IMPORTANT: Respond ONLY in the language identified as '{target_lang}'.
Be consistent, accurate, and adapt your tone to the platform context."""

        messages = [{"role": "system", "content": system_prompt}]

        # Inject context turns with explicit provenance tags for cross-platform memories
        for turn in context:
            origin = turn.get("platform_id", platform_id)
            user_msg = turn.get("user", "")
            assistant_msg = turn.get("assistant", "")

            # Tag cross-platform context turns so LLM is aware of provenance
            if origin != platform_id:
                user_msg = f"[From {origin}] {user_msg}"
                assistant_msg = f"[From {origin}] {assistant_msg}"

            messages.append({"role": "user", "content": user_msg})
            messages.append({"role": "assistant", "content": assistant_msg})

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
        context: Optional[List[dict]] = None,
        target_lang_name: str = "English",
        session_id: Optional[str] = None,
        image_base64: Optional[str] = None,
    ) -> Generator:
        """Yields text chunks as they arrive from the LLM."""
        if not session_id:
            session_id = self.context_engine.create_session(user_id)

        # Retrieve authorized context before constructing the prompt if not already provided
        if context is None:
            try:
                context = self.context_engine.get_context(
                    user_id=user_id,
                    session_id=session_id,
                    platform_id=platform_id
                )
            except Exception as e:
                print(f"[ReasoningEngine] Warning: Context retrieval failed: {e}")
                context = []

        vision_model = os.getenv("VISION_LLM_MODEL", "gpt-4o" if "openai" in os.getenv("OPENAI_BASE_URL", "").lower() else self.model)
        model = vision_model if image_base64 else self.model

        messages = self._build_messages(
            platform_id=platform_id,
            user_id=user_id,
            message=message,
            context=context,
            image_base64=image_base64,
            session_id=session_id,
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

    def generate(
        self,
        platform_id: str,
        user_id: str,
        message: str,
        context: Optional[List[dict]] = None,
        target_lang_name: str = "English",
        session_id: Optional[str] = None,
        image_base64: Optional[str] = None
    ) -> Tuple[str, float, str]:
        """Non-streaming fallback — collects full response."""
        if not session_id:
            session_id = self.context_engine.create_session(user_id)

        if context is None:
            try:
                context = self.context_engine.get_context(
                    user_id=user_id,
                    session_id=session_id,
                    platform_id=platform_id
                )
            except Exception as e:
                print(f"[ReasoningEngine] Warning: Context retrieval failed: {e}")
                context = []

        vision_model = os.getenv("VISION_LLM_MODEL", "gpt-4o" if "openai" in os.getenv("OPENAI_BASE_URL", "").lower() else self.model)
        model = vision_model if image_base64 else self.model

        messages = self._build_messages(
            platform_id=platform_id,
            user_id=user_id,
            message=message,
            context=context,
            image_base64=image_base64,
            session_id=session_id,
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
