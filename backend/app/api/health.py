"""GET /api/health and /api/config."""
from typing import Any

from fastapi import APIRouter

from ..config import VERSION, get_settings
from ..notice import notice_dict
from ..schemas import LANGUAGES

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": VERSION}


@router.get("/config")
async def config() -> dict[str, Any]:
    s = get_settings()
    return {"demo_mode": s.demo_mode, "languages": LANGUAGES, "max_stt_seconds": s.max_stt_seconds_per_room,
            "call_audio_provider": s.call_audio_provider if s.livekit_url else "none",
            "stt_partials": s.stt_partials, "retention_hours": s.server_retention_hours,
            "mic": {"aec": s.mic_aec, "ns": s.mic_ns, "agc": s.mic_agc},
            "notice": notice_dict(), "version": VERSION}
