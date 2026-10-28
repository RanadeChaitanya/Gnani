"""Is Gnani's /stt/v4/stream more accurate than /stt/v3/stream on Hinglish? Same clips, same headers, real-time pace."""
import asyncio
import json
import sys
import time
from statistics import mean

import numpy as np
import websockets

from common import RESULTS, S, cer, clip_path, dialogues, pcm16, read_wav, wer

sys.path.insert(0, str(RESULTS.parent.parent / "backend"))
from app.gnani.stt_client import FRAME_BYTES, build_headers  # noqa: E402

URLS = {"v3": "wss://api.vachana.ai/stt/v3/stream", "v4": "wss://api.vachana.ai/stt/v4/stream"}


async def stream(url: str, x: np.ndarray, headers: dict[str, str]) -> dict:
    pcm = pcm16(np.concatenate([x, np.zeros(int(1.5 * 16000))]))
    msgs: list[dict] = []
    async with websockets.connect(url, additional_headers=headers) as ws:
        first = json.loads(await ws.recv())

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
    finals = [m for m in msgs if m.get("type") in ("transcript", "final_transcript")]
    return {"first": first.get("type"), "text": " ".join(m.get("text", "") for m in finals),
            "latency": [m.get("latency") for m in finals], "types": sorted({m.get("type") for m in msgs})}


async def run(name: str, clips: list) -> list[dict]:
    s = S.model_copy(update={"stt_format_default": "verbatim", "stt_partials": False})
    h = build_headers(s, "en-IN", [])
    out = []
    for d, i, t in clips:
        r = await stream(URLS[name], read_wav(clip_path(d, i)), h)
        out.append({"cfg": name, "ref": t["text"], "hyp": r["text"], "wer": wer(t["text"], r["text"]),
                    "cer": cer(t["text"], r["text"]), "lat": r["latency"], "types": r["types"], "first": r["first"]})
    return out


async def main() -> None:
    clips = [(d, i, t) for d in dialogues() for i, t in enumerate(d["turns"])
             if d["speakers"][t["speaker"]]["tts_lang"] == "hi-en"]
    res = await asyncio.gather(*(run(n, clips) for n in URLS), return_exceptions=True)
    for name, rows in zip(URLS, res):
        if isinstance(rows, BaseException):
            print(f"{name}: ERROR {rows!r}")
            continue
        lat = [x for r in rows for x in r["lat"] if x]
        print(f"{name}: WER {mean(r['wer'] for r in rows):.3f}  CER {mean(r['cer'] for r in rows):.3f}  "
              f"latency p50 {sorted(lat)[len(lat) // 2] if lat else '-'} ms  first={rows[0]['first']} types={rows[0]['types']}")
    (RESULTS / "v3_vs_v4.json").write_text(json.dumps([r for x in res if not isinstance(x, BaseException) for r in x],
                                                      ensure_ascii=False, indent=1), encoding="utf-8")
    for name, rows in zip(URLS, res):
        if not isinstance(rows, BaseException):
            for r in rows[:3]:
                print(f"  {name}: {r['hyp']}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
