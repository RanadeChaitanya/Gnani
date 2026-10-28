"""Scenario vocabularies for Gnani word boosting (single letters-only words, ≤100 per session).

Measured on Hinglish TTS clips (eval/results/hinglish_ab.md): en-IN + verbatim + domain boosting cut WER
from 18.2 % to 14.8 % vs en-IN + ITN, and fixed "literature"→"litre", "tell"→"tel". Applied to en-IN only;
Devanagari languages keep ITN (not yet measured with boosting).
"""

COMMON = ["haan", "nahi", "theek", "chahiye", "dijiye", "kal", "aaj", "subah", "shaam", "baje", "rupaye",
          "rupees", "order", "number", "address", "bhaiya", "didi", "ji", "please", "delivery", "payment",
          "UPI", "paytm", "GPay", "cash"]

SCENARIOS: dict[str, list[str]] = {
    "shop": ["atta", "chawal", "dal", "chana", "gehun", "cheeni", "shakkar", "tel", "sarson", "ghee", "doodh",
             "dahi", "paneer", "makkhan", "anda", "kele", "aloo", "pyaz", "tamatar", "sabzi", "namak", "masala",
             "haldi", "mirchi", "chai", "biscuit", "sabun", "kilo", "gram", "litre", "packet", "dozen", "bori",
             "dukaan", "kirana", "bill", "total", "udhaar", "home", "bhej"],
    "appointment": ["doctor", "clinic", "hospital", "appointment", "dawai", "dawa", "bukhaar", "khansi", "dard",
                    "report", "test", "fees", "consultation", "slot", "Monday", "Tuesday", "Wednesday",
                    "Thursday", "Friday", "Saturday", "Sunday", "date", "time", "patient"],
    "complaint": ["complaint", "technician", "service", "repair", "warranty", "refund", "replacement", "ticket",
                  "parcel", "courier", "tracking", "internet", "wifi", "machine", "kharab", "band", "visit"],
    "general": [],
}


def bias_words(scenario: str, lang_code: str, user_words: list[str]) -> list[str]:
    """User words first (they matter most), then scenario + common vocabulary; deduped, ≤100."""
    base = (SCENARIOS.get(scenario, []) + COMMON) if lang_code == "en-IN" else []
    seen: set[str] = set()
    out = []
    for w in user_words + base:
        if w.casefold() not in seen:
            seen.add(w.casefold())
            out.append(w)
    return out[:100]
