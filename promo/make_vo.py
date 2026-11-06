"""Timbre v3.0 narration, one clean take per sentence. Run from saar/backend so the key stays in saar/.env."""
import asyncio, io, json, sys, wave, pathlib
import httpx, numpy as np
from app.config import get_settings
from app.gnani.tts_client import fix_wav_header
ROOT = pathlib.Path("D:/Gnani/saar-video/story")
S = json.load(open(ROOT/"script.json", encoding="utf-8"))
SPEED = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0

async def main():
    s = get_settings(); tot = 0
    async with httpx.AsyncClient(timeout=120) as c:
        for i, line in enumerate(S):
            text, SPEED = line[0], line[1]; VOICE = line[2] if len(line) > 2 else "Yashraj"
            for a in range(6):
                r = await c.post(f"{s.gnani_base_url}/api/v1/tts/inference", headers={"X-API-Key-ID": s.gnani_api_key},
                    json={"text": text, "voice": VOICE, "model": "timbre-v3.0", "language": "en-IN", "speed": SPEED,
                          "audio_config": {"sample_rate": 44100, "num_channels": 1, "sample_width": 2, "encoding": "linear_pcm", "container": "wav"}})
                if r.status_code not in (429, 500, 503): break
                await asyncio.sleep(2 ** a)
            if r.status_code != 200:
                print(r.status_code, r.text[:200]); return
            with wave.open(io.BytesIO(fix_wav_header(r.content))) as w:
                sr = w.getframerate()
                pcm = np.frombuffer(w.readframes(w.getnframes()), np.int16)
            loud = np.flatnonzero(np.abs(pcm) > 500)
            pcm = pcm[max(0, loud[0]-int(.01*sr)): loud[-1]+int(.08*sr)]
            with wave.open(str(ROOT/f"vo/{i:02d}.wav"), "wb") as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
            d = len(pcm)/sr; tot += d
            print(i, sr, round(d, 2), flush=True)
    print("total", round(tot, 2))
asyncio.run(main())
