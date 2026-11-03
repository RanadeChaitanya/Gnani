"""Item/number accuracy on realistic Hinglish grocery orders (modelled on the 2026-10-28 phone test).
Metric = share of gold items and quantities recovered (either script), not WER: that's what the note needs."""
import asyncio
import json
import re
import sys
import unicodedata
from statistics import mean

import httpx

from common import AUDIO, RESULTS, S, read_wav, wav_bytes
from run_eval import cached, store

sys.path.insert(0, str(RESULTS.parent.parent / "backend"))
from app.gnani.tts_client import synthesize  # noqa: E402
from app.numbers import word_numbers  # noqa: E402
from app.summarizer.faithfulness import numbers  # noqa: E402

# (text spoken by a Hinglish TTS voice, gold terms: each is "roman|देवनागरी", numbers as digits)
ORDERS = [
    ("Bhaiya mujhe sabse pehle pachaas kilo tel chahiye, uske baad bees kilo cheeni, tees kilo moong dal aur das kilo arhar dal.",
     ["tel|तेल", "cheeni|चीनी", "moong|मूंग", "arhar|अरहर"], ["50", "20", "30", "10"]),
    ("Do kilo kele, paanch kilo santre aur chaar kilo aam bhej dena.", ["kele|केले", "santre|संतरे", "aam|आम"], ["2", "5", "4"]),
    ("Ek kilo suji, do kilo besan aur teen kilo maida bhi chahiye.", ["suji|सूजी", "besan|बेसन", "maida|मैदा"], ["1", "2", "3"]),
    ("Sab ka bill kitna hua? Bees percent discount milega na?", ["bill|बिल", "discount|डिस्काउंट"], ["20"]),
    ("Aadha kilo jeera, dhai sau gram haldi aur ek packet namak.", ["jeera|जीरा", "haldi|हल्दी", "namak|नमक"], ["0.5", "250", "1"]),
    ("Kal subah das baje Shastri Nagar wale ghar pe delivery kar dena.", ["shastri|शास्त्री", "delivery|डिलीवरी"], ["10"]),
]
BROAD_HI = ("आटा चावल दाल अरहर तूर मूंग मसूर उड़द चना राजमा बेसन मैदा सूजी पोहा चीनी गुड़ नमक हल्दी मिर्च जीरा धनिया "
            "मसाला तेल सरसों घी दूध दही पनीर मक्खन अंडे ब्रेड बिस्कुट साबुन आलू प्याज़ टमाटर लहसुन अदरक भिंडी गोभी पालक "
            "मटर गाजर खीरा केले आम सेब संतरे अंगूर पपीता नारियल किलो ग्राम लीटर पैकेट दर्जन बोरी बिल कुल डिस्काउंट उधार "
            "डिलीवरी भेज दुकान भैया रुपये पैसे").split()
# v2's scenario vocabulary (removed from the app after this experiment showed it hurt: 84 % vs 94 %)
V2_SHOP_VOCAB = ("atta chawal dal chana gehun cheeni shakkar tel sarson ghee doodh dahi paneer makkhan anda kele aloo pyaz "
                 "tamatar sabzi namak masala haldi mirchi chai biscuit sabun kilo gram litre packet dozen bori dukaan kirana "
                 "bill total udhaar home bhej haan nahi theek chahiye dijiye kal aaj subah shaam baje rupaye rupees order "
                 "number address bhaiya didi ji please delivery payment UPI paytm GPay cash").split()
GROCERY_HI = ["तेल", "चीनी", "मूंग", "अरहर", "दाल", "केले", "संतरे", "आम", "सूजी", "बेसन", "मैदा", "बिल", "डिस्काउंट",
              "जीरा", "हल्दी", "नमक", "किलो", "पैकेट", "डिलीवरी"]


def configs() -> dict[str, dict[str, str]]:
    en = V2_SHOP_VOCAB
    return {
        "en_bias": {"language_code": "en-IN", "format": "verbatim", "bias_list": json.dumps(en), "bias_score": "1.5"},
        "en_plain": {"language_code": "en-IN", "format": "verbatim"},
        "hi_itn": {"language_code": "hi-IN", "format": "transcribe"},
        "hi_bias": {"language_code": "hi-IN", "format": "verbatim", "bias_list": json.dumps(GROCERY_HI, ensure_ascii=True),
                    "bias_score": "1.5"},
        "hi_plain": {"language_code": "hi-IN", "format": "verbatim"},
        "v3_auto": {"model": "prisma-v3.0", "language_code": "indic-auto", "format": "transcribe"},
        "v3_hi_en": {"model": "prisma-v3.0", "language_code": "hi-IN,en-IN", "format": "transcribe"},
        "v3_hi_en_ctx": {"model": "prisma-v3.0", "language_code": "hi-IN,en-IN", "format": "transcribe",
                         "topic": "A customer phones a kirana shop to order groceries: items, quantities, prices, delivery."},
        "hi_broad": {"language_code": "hi-IN", "format": "verbatim", "bias_list": json.dumps(BROAD_HI, ensure_ascii=True),
                     "bias_score": "1.0"},
    }


def norm(t: str) -> str:
    return unicodedata.normalize("NFKC", t).casefold()


def score(hyp: str, terms: list[str], nums: list[str]) -> tuple[int, int]:
    h = norm(hyp)
    ok = sum(any(v in h for v in norm(t).split("|")) for t in terms)
    vals = numbers(hyp) | word_numbers(hyp) | {re.sub(r"\.0$", "", n) for n in numbers(hyp)}
    ok += sum(n in vals for n in nums)
    return ok, len(terms) + len(nums)


async def main() -> None:
    out_dir = AUDIO / "grocery"
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    async with httpx.AsyncClient(timeout=90) as c:
        for k, (text, _, _) in enumerate(ORDERS):
            p = out_dir / f"{k}.wav"
            if not p.exists():
                p.write_bytes(await synthesize(c, S, text, "Poorvi", "hi-en"))
        for name, form in configs().items():
            for k, (text, terms, nums) in enumerate(ORDERS):
                audio = wav_bytes(read_wav(out_dir / f"{k}.wav"), 16000)
                key, hit = cached("grocery", audio, form)
                if not hit:
                    for attempt in range(5):
                        r = await c.post(f"{S.gnani_base_url}/stt/v3", headers={"X-API-Key-ID": S.gnani_api_key},
                                         files={"audio_file": ("c.wav", audio, "audio/wav")}, data=form)
                        if r.status_code != 429:
                            break
                        await asyncio.sleep(2 ** attempt)
                    r.raise_for_status()
                    hit = store(key, {"text": r.json().get("transcript", "")})
                ok, n = score(hit["text"], terms, nums)
                rows.append({"cfg": name, "k": k, "hyp": hit["text"], "ok": ok, "n": n})
    print("| config | items+numbers recovered |\n|---|---|")
    for name in configs():
        rs = [r for r in rows if r["cfg"] == name]
        print(f"| {name} | {sum(r['ok'] for r in rs)}/{sum(r['n'] for r in rs)} ({100 * sum(r['ok'] for r in rs) / sum(r['n'] for r in rs):.0f} %) |")
    for k in range(len(ORDERS)):
        print(f"\nREF  {ORDERS[k][0]}")
        for r in [r for r in rows if r["k"] == k]:
            print(f"{r['cfg']:9s} {r['ok']}/{r['n']}  {r['hyp']}")
    (RESULTS / "grocery_ab.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    asyncio.run(main())
