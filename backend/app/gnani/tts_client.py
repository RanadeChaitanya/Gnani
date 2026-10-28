"""Gnani Timbre TTS REST helper (used by smoke tests and the eval harness)."""
import struct

import httpx

from ..config import Settings


def fix_wav_header(b: bytes) -> bytes:
    """Gnani returns streaming-style WAVs (RIFF/data sizes 0xFFFFFFFF); rewrite them from the real length."""
    i = b.find(b"data")
    if i < 0:
        return b
    n = len(b) - i - 8
    return b[:4] + struct.pack("<I", len(b) - 8) + b[8:i + 4] + struct.pack("<I", n) + b[i + 8:]


async def synthesize(c: httpx.AsyncClient, s: Settings, text: str, voice: str, lang: str,
                     sample_rate: int = 16000) -> bytes:
    r = await c.post(f"{s.gnani_base_url}/api/v1/tts/inference", headers={"X-API-Key-ID": s.gnani_api_key},
                     json={"text": text, "voice": voice, "model": "timbre-v2.5", "language": lang,
                           "audio_config": {"sample_rate": sample_rate, "num_channels": 1, "sample_width": 2,
                                            "encoding": "linear_pcm", "container": "wav"}})
    r.raise_for_status()
    return fix_wav_header(r.content)
