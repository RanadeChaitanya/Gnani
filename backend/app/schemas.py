"""REST request/response models (§9.1). WS messages are plain dicts documented in §9.2/9.3."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .gnani.stt_client import validate_bias_words

LANGUAGES = [
    {"code": "en-IN", "label": "English / Hinglish", "native": "English"},
    {"code": "hi-IN", "label": "Hindi", "native": "हिन्दी"},
    {"code": "mr-IN", "label": "Marathi", "native": "मराठी"},
    {"code": "bn-IN", "label": "Bengali", "native": "বাংলা"},
    {"code": "gu-IN", "label": "Gujarati", "native": "ગુજરાતી"},
    {"code": "kn-IN", "label": "Kannada", "native": "ಕನ್ನಡ"},
    {"code": "ml-IN", "label": "Malayalam", "native": "മലയാളം"},
    {"code": "pa-IN", "label": "Punjabi", "native": "ਪੰਜਾਬੀ"},
    {"code": "ta-IN", "label": "Tamil", "native": "தமிழ்"},
    {"code": "te-IN", "label": "Telugu", "native": "తెలుగు"},
]
LangCode = Literal["en-IN", "hi-IN", "mr-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "ta-IN", "te-IN"]


class JoinRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    lang_code: LangCode = "en-IN"
    notes_lang: Literal["en", "same", "hi"] = "en"
    bias_words: list[str] = Field(default_factory=list)

    @field_validator("display_name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("display_name is empty")
        return v

    @field_validator("bias_words")
    @classmethod
    def _bias(cls, v: list[str]) -> list[str]:
        return validate_bias_words(v)


class CreateRoomRequest(JoinRequest):
    solo: bool = False


class ConsentRequest(BaseModel):
    action: Literal["grant", "revoke"]
    notice_version: str
