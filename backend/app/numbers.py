"""Spoken numbers in English, Hindi and Marathi (Roman or Devanagari) → values.

ASR keeps Hinglish numbers as words ("dus kilo", "do sau assi rupaye"); notes use digits, so the
faithfulness check needs both forms to match.
"""
import re
import unicodedata

_UNITS: dict[str, float] = {}


def _add(value: float, *words: str) -> None:
    for w in words:
        _UNITS[w] = value


# English
for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
                      "fifteen sixteen seventeen eighteen nineteen".split()):
    _add(i, w)
for v, w in zip(range(20, 100, 10), "twenty thirty forty fifty sixty seventy eighty ninety".split()):
    _add(v, w)
# Hindi (Roman spellings seen in ASR output, then Devanagari)
_add(1, "ek", "एक"); _add(2, "do", "दो"); _add(3, "teen", "tin", "तीन"); _add(4, "char", "chaar", "चार")  # noqa: E702
_add(5, "paanch", "panch", "paach", "पाँच", "पांच"); _add(6, "chhe", "chhah", "che", "छह", "छः")  # noqa: E702
_add(7, "saat", "सात"); _add(8, "aath", "आठ"); _add(9, "nau", "नौ"); _add(10, "das", "dus", "dais", "दस")  # "dais": common ASR mishearing of das  # noqa: E702
_add(11, "gyarah", "gyara", "ग्यारह"); _add(12, "barah", "bara", "बारह"); _add(13, "terah", "तेरह")  # noqa: E702
_add(14, "chaudah", "चौदह"); _add(15, "pandrah", "pandra", "पंद्रह"); _add(16, "solah", "सोलह")  # noqa: E702
_add(17, "satrah", "सत्रह"); _add(18, "atharah", "athara", "अठारह"); _add(19, "unnis", "उन्नीस")  # noqa: E702
_add(20, "bees", "bis", "बीस"); _add(25, "pachchis", "pachis", "pachees", "पच्चीस")  # noqa: E702
_add(30, "tees", "तीस"); _add(40, "chalis", "chaalis", "चालीस"); _add(50, "pachas", "pachaas", "पचास")  # noqa: E702
_add(60, "saath", "sath", "साठ"); _add(70, "sattar", "सत्तर"); _add(80, "assi", "अस्सी")  # noqa: E702
_add(90, "nabbe", "नब्बे"); _add(1.5, "dedh", "डेढ़"); _add(2.5, "dhai", "ढाई")  # noqa: E702
_add(0.5, "aadha", "adha", "आधा", "अर्धा")
# Marathi (Devanagari)
_add(2, "दोन"); _add(5, "पाच"); _add(6, "सहा"); _add(9, "नऊ"); _add(10, "दहा"); _add(20, "वीस")  # noqa: E702
_add(40, "चाळीस"); _add(50, "पन्नास"); _add(1.5, "दीड"); _add(2.5, "अडीच")  # noqa: E702

_MULT = {"hundred": 100, "sau": 100, "सौ": 100, "शंभर": 100, "shambhar": 100, "thousand": 1000, "hazaar": 1000,
         "hazar": 1000, "हज़ार": 1000, "हजार": 1000, "lakh": 100000, "लाख": 100000, "crore": 10**7, "करोड़": 10**7}
_SAADE = {"saade", "sadhe", "साढ़े", "साडे"}  # "saade teen" = 3.5


def clean(text: str, keep: str = "") -> str:
    """Punctuation → space. Not `\w`: Python's \w drops Devanagari vowel signs (category M*) and splits words."""
    return "".join(c if unicodedata.category(c)[0] in "LMN" or c.isspace() or c in keep else " " for c in text)


def ascii_digits(text: str) -> str:
    """Map any Unicode decimal digit (Devanagari, Tamil, …) to ASCII."""
    return "".join(str(unicodedata.digit(c)) if unicodedata.category(c) == "Nd" else c for c in text)


def _fmt(v: float) -> str:
    return str(int(v)) if v == int(v) else str(v)


def word_numbers(text: str) -> set[str]:
    """Values of spoken-number runs: "do sau assi" → 280, "dhai sau" → 250, "saade paanch" → 5.5.
    Each single number word is also included, so "ek do gehun" yields 1, 2 and 3."""
    out: set[str] = set()
    toks = clean(unicodedata.normalize("NFKC", text).casefold()).split()
    total = cur = 0.0
    seen = half = False
    for tok in toks + [""]:
        if tok in _SAADE:
            half = True
            continue
        if tok in _UNITS:
            cur += _UNITS[tok] + (0.5 if half else 0)
            out.add(_fmt(_UNITS[tok]))
            seen, half = True, False
        elif tok in _MULT and seen:
            m = _MULT[tok]
            if m == 100:
                cur = (cur or 1) * 100
            else:
                total += (cur or 1) * m
                cur = 0
        else:
            if seen:
                out.add(_fmt(total + cur))
            total = cur = 0
            seen = half = False
    return out
