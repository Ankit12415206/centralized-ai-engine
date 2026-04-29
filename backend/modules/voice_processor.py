"""
Voice Processing Module
Speech-to-text (STT) and Text-to-speech (TTS).
"""

import io
import base64
from gtts import gTTS
import speech_recognition as sr


class VoiceProcessorModule:
    def __init__(self):
        self.recognizer = sr.Recognizer()

    def speech_to_text(self, audio_bytes: bytes, language: str = "en-US") -> str:
        audio_file = io.BytesIO(audio_bytes)
        try:
            with sr.AudioFile(audio_file) as source:
                audio_data = self.recognizer.record(source)
            return self.recognizer.recognize_google(audio_data, language=language)
        except sr.UnknownValueError:
            return ""
        except sr.RequestError as e:
            raise RuntimeError(f"Speech recognition error: {e}")

    def text_to_speech(self, text: str, language: str = "en") -> str:
        try:
            tts = gTTS(text=text, lang=language, slow=False)
            buffer = io.BytesIO()
            tts.write_to_fp(buffer)
            buffer.seek(0)
            return base64.b64encode(buffer.read()).decode("utf-8")
        except Exception as e:
            raise RuntimeError(f"TTS error: {e}")