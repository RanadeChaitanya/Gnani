"""Phase 0 smoke tests and probes against the real services. Uses keys from ../../.env.

  python scripts/smoke.py tts      # Gnani TTS -> eval/audio/smoke_{en,hi,mr}.wav (16 kHz)
  python scripts/smoke.py rest     # STT REST on those WAVs
  python scripts/smoke.py ws       # STT WebSocket, real-time pace, on those WAVs
  python scripts/smoke.py probe    # 2 concurrent sockets, 60 s idle timeout, x-partials
  python scripts/smoke.py llm      # DeepSeek returns a schema-valid note
  python scripts/smoke.py all
"""
import asyncio
import io
import json
import sys
import time
import wave
from pathlib import Path

import httpx
import websockets

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import ROOT, get_settings  # noqa: E402
from app.gnani.stt_client import FRAME_BYTES, build_headers  # noqa: E402
from app.summarizer import prompts  # noqa: E402
from app.summarizer.providers import make_provider  # noqa: E402
from app.summarizer.schema import NoteContent, json_schema  # noqa: E402

OUT = ROOT / "eval" / "audio"
S = get_settings()
SAMPLES = {
    "en": ("en-IN", "Kaveri", "Hello, I would like to order two kilos of rice and one litre of oil for delivery tomorrow."),
    "hi": ("hi-IN", "Nalini", "नमस्ते, मुझे कल सुबह दस बजे डॉक्टर से मिलने का समय चाहिए।"),
    "mr": ("mr-IN", "Zahira", "नमस्कार, मला उद्या दोन किलो साखर आणि एक लिटर दूध पाहिजे."),
}


def wav_pcm(path: Path) -> bytes:
    with wave.open(str(path)) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2, path
        return w.readframes(w.getnframes())


async def tts() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=60) as c:
        for name, (lang, voice, text) in SAMPLES.items():
            r = await c.post(f"{S.gnani_base_url}/api/v1/tts/inference", headers={"X-API-Key-ID": S.gnani_api_key},
                             json={"text": text, "voice": voice, "model": "timbre-v2.5", "language": lang,
                                   "audio_config": {"sample_rate": 16000, "num_channels": 1, "sample_width": 2,
                                                    "encoding": "linear_pcm", "container": "wav"}})
            r.raise_for_status()
            p = OUT / f"smoke_{name}.wav"
            p.write_bytes(r.content)
            with wave.open(io.BytesIO(r.content)) as w:
                print(f"TTS {name}: {p.name} {w.getframerate()} Hz, {w.getnframes() / w.getframerate():.1f} s")


async def rest() -> None:
    async with httpx.AsyncClient(timeout=60) as c:
        for name, (lang, _, _) in SAMPLES.items():
            p = OUT / f"smoke_{name}.wav"
            r = await c.post(f"{S.gnani_base_url}/stt/v3", headers={"X-API-Key-ID": S.gnani_api_key},
                             files={"audio_file": (p.name, p.read_bytes(), "audio/wav")},
                             data={"language_code": lang, "format": "transcribe"})
            print(f"REST {name} [{r.status_code}]: {r.json().get('transcript', r.text)}")


async def stream_file(lang: str, pcm: bytes, extra: dict[str, str] | None = None, tag: str = "") -> list[dict]:
    headers = build_headers(S, lang, []) | (extra or {})
    pcm += bytes(16000 * 2 * 2)  # 2 s trailing silence so VAD closes the last segment
    msgs: list[dict] = []
    async with websockets.connect(S.stt_url, additional_headers=headers) as ws:
        msgs.append(json.loads(await ws.recv()))

        async def reader() -> None:
            async for m in ws:
                msgs.append(json.loads(m))

        rt = asyncio.ensure_future(reader())
        t0 = time.perf_counter()
        for i in range(len(pcm) // FRAME_BYTES):
            await asyncio.sleep(max(0, t0 + i * 0.032 - time.perf_counter()))
            await ws.send(pcm[i * FRAME_BYTES:(i + 1) * FRAME_BYTES])
        await asyncio.sleep(2)
        rt.cancel()
    for m in msgs:
        print(f"WS {tag or lang}: {m.get('type')} {m.get('text', m.get('message', ''))} "
              f"{'latency=' + str(m['latency']) + 'ms' if 'latency' in m else ''}")
    return msgs


async def ws() -> None:
    for name, (lang, _, _) in SAMPLES.items():
        await stream_file(lang, wav_pcm(OUT / f"smoke_{name}.wav"), tag=name)


async def probe() -> None:
    pcm = wav_pcm(OUT / "smoke_en.wav")
    print("--- concurrency: two sockets on one key ---")
    res = await asyncio.gather(stream_file("en-IN", pcm, tag="A"), stream_file("en-IN", pcm, tag="B"),
                               return_exceptions=True)
    for tag, r in zip("AB", res):
        print(f"socket {tag}: {'ERROR ' + repr(r) if isinstance(r, BaseException) else 'ok, ' + str(sum(m.get('type') == 'transcript' for m in r)) + ' transcripts'}")
    print("--- x-partials ---")
    msgs = await stream_file("en-IN", pcm, {"x-partials": "true"}, tag="partials")
    print("partial messages seen:", sum(m.get("type") == "partial_transcript" for m in msgs))
    print("--- idle: connect, send nothing for 60 s ---")
    async with websockets.connect(S.stt_url, additional_headers=build_headers(S, "en-IN", [])) as w:
        await w.recv()
        t0 = time.monotonic()
        try:
            await asyncio.wait_for(w.wait_closed(), 60)
            print(f"server closed idle socket after {time.monotonic() - t0:.1f} s (code {w.close_code})")
        except TimeoutError:
            print("socket still open after 60 s idle")


async def llm() -> None:
    segs = [{"seq": 1, "name": "Asha", "text": "Namaste, mujhe do kilo atta aur ek litre tel chahiye", "started_at": 0},
            {"seq": 2, "name": "Ravi", "text": "हो, ₹२५० होतील. उद्या सकाळी दहा वाजता देतो", "started_at": 4},
            {"seq": 3, "name": "Asha", "text": "Theek hai, kal 10 baje bhej dena", "started_at": 9}]
    p = make_provider(S)
    raw, usage = await p.generate_note(
        prompts.system_prompt(json_schema()),
        prompts.user_prompt("en", [{"name": "Asha", "lang_code": "en-IN"}, {"name": "Ravi", "lang_code": "mr-IN"}],
                            prompts.transcript_lines(segs, 60000)), max_tokens=1500, timeout_s=60)
    NoteContent.model_validate(raw)
    print(f"LLM ({p.model}) valid note, tokens {usage}:\n{json.dumps(raw, ensure_ascii=False, indent=1)}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    steps = {"tts": tts, "rest": rest, "ws": ws, "probe": probe, "llm": llm}
    for name in (steps if cmd == "all" else [cmd]):
        print(f"===== {name} =====")
        asyncio.run(steps[name]())
