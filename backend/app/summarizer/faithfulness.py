"""Deterministic faithfulness check (§12.4): numbers and names in the note must appear in the transcript."""
import re
import unicodedata
from typing import Any

from rapidfuzz import fuzz

_NUM = re.compile(r"\d+(?:[.,]\d+)*")

_UNITS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
    "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "छह": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
    "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5, "panch": 5, "chhe": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
}
_MULT = {"hundred": 100, "sau": 100, "सौ": 100, "thousand": 1000, "hazaar": 1000, "hazar": 1000, "हज़ार": 1000,
         "हजार": 1000, "lakh": 100000, "लाख": 100000, "crore": 10**7, "करोड़": 10**7}


def ascii_digits(text: str) -> str:
    """Map any Unicode decimal digit (Devanagari, Tamil, …) to ASCII."""
    return "".join(str(unicodedata.digit(c)) if unicodedata.category(c) == "Nd" else c for c in text)


def normalize(text: str) -> str:
    text = ascii_digits(unicodedata.normalize("NFKC", text)).casefold()
    text = re.sub(r"(?<=\d),(?=\d)", "", text)  # 5,00,000 -> 500000
    return re.sub(r"[^\w\s.]", " ", text)


def numbers(text: str) -> set[str]:
    out = set()
    for m in _NUM.findall(normalize(text)):
        m = m.rstrip(".")
        out.add(m)
        if m.endswith(".00") or m.endswith(".0"):
            out.add(m.split(".")[0])
    return out


def word_numbers(text: str) -> set[str]:
    """Basic en/hi number words -> digit strings ("five hundred" -> 500)."""
    out: set[str] = set()
    total = cur = 0
    seen = False
    for tok in normalize(text).split() + [""]:
        if tok in _UNITS:
            cur += _UNITS[tok]
            seen = True
        elif tok in _MULT and seen:
            m = _MULT[tok]
            if m == 100:
                cur = (cur or 1) * 100
            else:
                total += (cur or 1) * m
                cur = 0
        elif seen:
            out.add(str(total + cur))
            total = cur = 0
            seen = False
    return out


def _texts(note: dict[str, Any]) -> list[tuple[str, str]]:
    """(field, text) pairs to scan for numbers. Uncertain spans are excluded: they are flagged by design."""
    out = [("title", note.get("title", ""))]
    out += [(f"summary[{i}]", s) for i, s in enumerate(note.get("summary", []))]
    for f in ("key_points", "decisions"):
        out += [(f"{f}[{i}]", x["text"]) for i, x in enumerate(note.get(f, []))]
    for i, a in enumerate(note.get("action_items", [])):
        out += [(f"action_items[{i}]", " ".join(str(a.get(k) or "") for k in ("task", "owner", "due")))]
    for k, vals in (note.get("entities") or {}).items():
        out += [(f"entities.{k}[{i}]", v) for i, v in enumerate(vals)]
    return out


def check(note: dict[str, Any], segments: list[dict[str, Any]], names: list[str]) -> dict[str, Any]:
    """Return {flag_count, flags[], checked_count}. Never removes anything from the note."""
    corpus = normalize(" ".join(names + [s["text"] for s in segments]))
    known = numbers(corpus) | word_numbers(corpus)
    seqs = {s["seq"] for s in segments}
    flags: list[dict[str, Any]] = []
    checked = 0

    for field, text in _texts(note):
        for n in numbers(text):
            checked += 1
            if n not in known:
                flags.append({"field": field, "value": n, "reason": "not_found_in_transcript"})

    ents = note.get("entities") or {}
    proper = [(f"entities.{k}[{i}]", v) for k in ("people", "organizations", "places")
              for i, v in enumerate(ents.get(k, []))]
    proper += [(f"action_items[{i}].owner", a["owner"]) for i, a in enumerate(note.get("action_items", []))
               if a.get("owner")]
    for field, name in proper:
        checked += 1
        n = normalize(name).strip()
        if n and n not in corpus and fuzz.partial_ratio(n, corpus) < 90:
            flags.append({"field": field, "value": name, "reason": "not_found_in_transcript"})

    for f in ("key_points", "decisions", "action_items", "uncertain_spans"):
        for i, item in enumerate(note.get(f, [])):
            bad = [e for e in item.get("evidence", []) if e not in seqs]
            if bad:
                flags.append({"field": f"{f}[{i}]", "value": bad, "reason": "bad_evidence"})

    return {"flag_count": len(flags), "flags": flags, "checked_count": checked}
