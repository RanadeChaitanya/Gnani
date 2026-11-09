"""Generate the demo narration, one take per scene (Gnani Timbre v3.0), and the scene timeline.

Run from `backend/` with its virtualenv: python ../media/demo/generate_narration.py
"""

import asyncio, io, json, pathlib, wave
import httpx, numpy as np
from app.config import get_settings
from app.gnani.tts_client import fix_wav_header

D = pathlib.Path(__file__).resolve().parent


async def main():
    s = get_settings()
    out = {}
    async with httpx.AsyncClient(timeout=180) as c:
        for k, text in json.load(open(D / "narration.json", encoding="utf-8")):
            for a in range(6):
                r = await c.post(
                    f"{s.gnani_base_url}/api/v1/tts/inference",
                    headers={"X-API-Key-ID": s.gnani_api_key},
                    json={
                        "text": text,
                        "voice": "Yashraj",
                        "model": "timbre-v3.0",
                        "language": "en-IN",
                        "speed": 1.08,
                        "audio_config": {
                            "sample_rate": 44100,
                            "num_channels": 1,
                            "sample_width": 2,
                            "encoding": "linear_pcm",
                            "container": "wav",
                        },
                    },
                )
                if r.status_code not in (429, 500, 503):
                    break
                await asyncio.sleep(2**a)
            r.raise_for_status()
            with wave.open(io.BytesIO(fix_wav_header(r.content))) as w:
                pcm = np.frombuffer(w.readframes(w.getnframes()), np.int16)
            loud = np.flatnonzero(np.abs(pcm) > 500)
            pcm = pcm[max(0, loud[0] - 400) : loud[-1] + 3000]
            with wave.open(str(D / f"vo/{k}.wav"), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(44100)
                w.writeframes(pcm.tobytes())
            out[k] = round(len(pcm) / 44100, 2)
            print(k, out[k], flush=True)
    # each scene lasts its narration plus a short breath; the title and closing hold a little longer
    pad, t, tl = {"title": 1.6, "close": 2.6}, 0.0, []
    for k, d in out.items():
        dur = round(d + pad.get(k, 1.3), 2)
        tl.append({"k": k, "s": round(t, 2), "d": dur, "vo": round(t + 0.45, 2)})
        t += dur
    json.dump(tl, open(D / "timeline.json", "w"), indent=0)
    print("total", round(t, 1))


asyncio.run(main())
