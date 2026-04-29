"""
Multilingual Interaction Module
Detects language, translates to English for reasoning, translates response back.
"""

from langdetect import detect, LangDetectException
from deep_translator import GoogleTranslator
from typing import Tuple

class MultilingualModule:
    SUPPORTED_LANGUAGES = {
        "en": "English", "hi": "Hindi", "fr": "French",
        "es": "Spanish", "de": "German", "zh-cn": "Chinese (Simplified)",
        "ar": "Arabic", "pt": "Portuguese", "ru": "Russian", "ja": "Japanese",
        "pa": "Punjabi", "ta": "Tamil", "bn": "Bengali", "ur": "Urdu",
    }

    def __init__(self):
        self.internal_language = "en"

    def detect_language(self, text: str) -> str:
        try:
            lang = detect(text)
            return lang if lang in self.SUPPORTED_LANGUAGES else "en"
        except LangDetectException:
            return "en"

    def translate_to_internal(self, text: str, source_lang: str) -> str:
        if source_lang == self.internal_language:
            return text
        try:
            return GoogleTranslator(source=source_lang, target="en").translate(text)
        except Exception:
            return text

    def translate_response(self, response: str, target_lang: str) -> str:
        if target_lang == self.internal_language:
            return response
        try:
            return GoogleTranslator(source="en", target=target_lang).translate(response)
        except Exception:
            return response

    def process(self, text: str, preferred_lang: str = "en") -> Tuple[str, str]:
        detected = self.detect_language(text)
        source_lang = detected if detected in self.SUPPORTED_LANGUAGES else preferred_lang
        normalized = self.translate_to_internal(text, source_lang)
        return source_lang, normalized