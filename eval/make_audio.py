"""Synthesize every dialogue turn with Gnani Timbre TTS (16 kHz mono WAV). Skips clips that already exist.

  python eval/make_audio.py            # costs TTS credits once; results cached on disk
"""
import asyncio

import httpx

from common import AUDIO, S, clip_path, dialogues

from app.gnani.tts_client import synthesize  # noqa: E402


async def main() -> None:
    sem = asyncio.Semaphore(3)
    async with httpx.AsyncClient(timeout=90) as c:
        async def one(d: dict, i: int, turn: dict) -> None:
            p = clip_path(d, i)
            if p.exists():
                return
            spk = d["speakers"][turn["speaker"]]
            async with sem:
                data = await synthesize(c, S, turn["text"], spk["voice"], spk["tts_lang"])
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
            print("tts", p.relative_to(AUDIO))

        await asyncio.gather(*(one(d, i, t) for d in dialogues() for i, t in enumerate(d["turns"])))


if __name__ == "__main__":
    asyncio.run(main())
