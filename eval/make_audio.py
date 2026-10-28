"""Synthesize every dialogue turn with Gnani Timbre TTS (16 kHz mono WAV). Skips clips that already exist.

  python eval/make_audio.py            # costs TTS credits once; results cached on disk
"""
import asyncio

import httpx

from common import AUDIO, SR, S, clip_path, dialogues


async def synth(c: httpx.AsyncClient, text: str, voice: str, lang: str) -> bytes:
    r = await c.post(f"{S.gnani_base_url}/api/v1/tts/inference", headers={"X-API-Key-ID": S.gnani_api_key},
                     json={"text": text, "voice": voice, "model": "timbre-v2.5", "language": lang,
                           "audio_config": {"sample_rate": SR, "num_channels": 1, "sample_width": 2,
                                            "encoding": "linear_pcm", "container": "wav"}})
    r.raise_for_status()
    return r.content


async def main() -> None:
    sem = asyncio.Semaphore(3)
    async with httpx.AsyncClient(timeout=90) as c:
        async def one(d: dict, i: int, turn: dict) -> None:
            p = clip_path(d, i)
            if p.exists():
                return
            spk = d["speakers"][turn["speaker"]]
            async with sem:
                data = await synth(c, turn["text"], spk["voice"], spk["tts_lang"])
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
            print("tts", p.relative_to(AUDIO))

        await asyncio.gather(*(one(d, i, t) for d in dialogues() for i, t in enumerate(d["turns"])))


if __name__ == "__main__":
    asyncio.run(main())
