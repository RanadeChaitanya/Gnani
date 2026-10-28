"""Which Gnani setting serves Hinglish speakers best? (v2 improvement #10)

Hinglish turns (TTS voice Poorvi, `hi-en`) through STT REST with:
  en_transcribe   lang en-IN, ITN on            (v1 default)
  en_verbatim     lang en-IN, spoken form
  en_bias         lang en-IN, verbatim + domain word boosting (score 1.5)
  hi_transcribe   lang hi-IN, ITN on (Devanagari output, romanised here for scoring)
Scores: WER/CER vs the Roman reference (Devanagari is romanised with ITRANS → approximate), and
number accuracy (every gold number word/digit recovered, as a value).
"""
import asyncio
import json
import re
import sys
from statistics import mean

import httpx
from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate

from common import RESULTS, S, cer, clip_path, dialogues, read_wav, wav_bytes, wer
from run_eval import cached, store

sys.path.insert(0, str(RESULTS.parent.parent / "backend"))
from app.summarizer.faithfulness import numbers, word_numbers  # noqa: E402

DOMAIN = ["atta", "chawal", "dal", "chana", "gehun", "cheeni", "tel", "doodh", "kele", "kilo", "litre", "packet",
          "dozen", "rupaye", "delivery", "bhaiya", "dukaan", "sarson", "appointment", "doctor", "technician",
          "order", "number", "subah", "shaam", "kal", "baje", "dijiye", "chahiye", "theek"]
CONFIGS = {
    "en_transcribe": {"language_code": "en-IN", "format": "transcribe"},
    "en_verbatim": {"language_code": "en-IN", "format": "verbatim"},
    "en_bias": {"language_code": "en-IN", "format": "verbatim", "bias_list": json.dumps(DOMAIN), "bias_score": "1.5"},
    "hi_transcribe": {"language_code": "hi-IN", "format": "transcribe"},
}


def roman(t: str) -> str:
    if not re.search(r"[ऀ-ॿ]", t):
        return t
    r = transliterate(t, sanscript.DEVANAGARI, sanscript.ITRANS).lower()
    return re.sub(r"[^a-z0-9₹\s]", "", r.replace("aa", "a").replace("ii", "i").replace("uu", "u"))


def values(t: str) -> set[str]:
    return numbers(t) | word_numbers(t)


async def main() -> None:
    clips = [(d, i, t) for d in dialogues() for i, t in enumerate(d["turns"])
             if d["speakers"][t["speaker"]]["tts_lang"] == "hi-en"]
    print(f"{len(clips)} Hinglish clips, {sum(len(read_wav(clip_path(d, i))) for d, i, _ in clips) / 16000:.0f} s each config")
    rows = []
    async with httpx.AsyncClient(timeout=90) as c:
        for name, form in CONFIGS.items():
            for d, i, t in clips:
                audio = wav_bytes(read_wav(clip_path(d, i)), 16000)
                key, hit = cached("rest_ab", audio, form)
                if not hit:
                    for attempt in range(5):
                        r = await c.post(f"{S.gnani_base_url}/stt/v3", headers={"X-API-Key-ID": S.gnani_api_key},
                                         files={"audio_file": ("c.wav", audio, "audio/wav")}, data=form)
                        if r.status_code != 429:
                            break
                        await asyncio.sleep(2 ** attempt)
                    r.raise_for_status()
                    hit = store(key, {"text": r.json().get("transcript", "")})
                hyp = hit["text"]
                gold = values(t["text"])
                got = values(hyp)
                rows.append({"config": name, "ref": t["text"], "hyp": hyp, "wer": wer(t["text"], roman(hyp)),
                             "cer": cer(t["text"], roman(hyp)),
                             "num_total": len(gold), "num_ok": len(gold & got)})
    out = ["| config | WER | CER | numbers recovered |", "|---|---|---|---|"]
    for name in CONFIGS:
        rs = [r for r in rows if r["config"] == name]
        nt, nk = sum(r["num_total"] for r in rs), sum(r["num_ok"] for r in rs)
        out.append(f"| {name} | {mean(r['wer'] for r in rs):.3f} | {mean(r['cer'] for r in rs):.3f} | {nk}/{nt} |")
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "hinglish_ab.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    (RESULTS / "hinglish_ab.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print("\n".join(out))
    for r in rows:
        if r["ref"].startswith("Do kilo atta") or r["ref"].startswith("Theek hai, total"):
            print(f"{r['config']:14s} {r['hyp']}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
