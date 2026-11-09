"""Generate the two synthetic voices for the demo call, one fake-microphone track per phone.

Run from `backend/` with its virtualenv so the Gnani key is read from `.env`:
    python ../media/demo/generate_call_audio.py
"""

import asyncio, io, json, pathlib, wave
import httpx
import numpy as np
from app.config import get_settings
from app.gnani.tts_client import fix_wav_header

OUT = pathlib.Path(__file__).resolve().parent
SR = 44100
LEAD = 9.0  # mic opens before consent; keep quiet until the call is live
# (speaker, language, text, start second after LEAD)
TURNS = [
    (
        "J",
        "hi-IN",
        "Namaste Gupta ji, Diwali ke liye paanch carton cheeni bhejiye.",
        0.0,
    ),
    (
        "G",
        "en-IN",
        "Sure Lal ji. Sugar is sixteen hundred rupees per carton, the usual rate.",
        5.5,
    ),
    ("J", "mr-IN", "आणि दोन डबे तेल पण पाठवा.", 12.5),
    (
        "G",
        "hi-IN",
        "Theek hai, do tin tel, saat sau rupaye ka ek. Delivery Friday ko.",
        17.0,
    ),
    ("J", "en-IN", "Perfect, Friday then. Thank you.", 24.0),
]
VOICE = {"J": "Harshad", "G": "Shubham"}


async def main():
    s = get_settings()
    tracks = {k: np.zeros(int(SR * 90), np.int16) for k in VOICE}
    async with httpx.AsyncClient(timeout=120) as c:
        for who, lang, text, at in TURNS:
            r = await c.post(
                f"{s.gnani_base_url}/api/v1/tts/inference",
                headers={"X-API-Key-ID": s.gnani_api_key},
                json={
                    "text": text,
                    "voice": VOICE[who],
                    "model": "timbre-v3.0",
                    "language": lang,
                    "speed": 1.0,
                    "audio_config": {
                        "sample_rate": SR,
                        "num_channels": 1,
                        "sample_width": 2,
                        "encoding": "linear_pcm",
                        "container": "wav",
                    },
                },
            )
            r.raise_for_status()
            with wave.open(io.BytesIO(fix_wav_header(r.content))) as w:
                pcm = np.frombuffer(w.readframes(w.getnframes()), np.int16)
            a = int((LEAD + at) * SR)
            tracks[who][a : a + len(pcm)] = pcm
            print(who, lang, round(len(pcm) / SR, 2), "s at", at)
    for k, x in tracks.items():
        with wave.open(str(OUT / f"mic_{k}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(x.tobytes())
    json.dump(
        TURNS, open(OUT / "turns.json", "w", encoding="utf-8"), ensure_ascii=False
    )


asyncio.run(main())
