"""Deterministic faithfulness check (§12.4), v2 schema: every number, name and place in the note must be
traceable to the transcript (digits or spoken number words), every citation must exist, and any total a
speaker stated must agree with the code-computed sum when all prices are known."""
import re
import unicodedata
from typing import Any

from rapidfuzz import fuzz

from ..numbers import ascii_digits, clean, word_numbers
from .schema import compute_costs

_NUM = re.compile(r"\d+(?:[.,]\d+)*")
_TIME = re.compile(r"\b(\d{1,2}):\d{2}\b")


def normalize(text: str) -> str:
    text = ascii_digits(unicodedata.normalize("NFKC", text)).casefold()
    text = re.sub(r"(?<=\d),(?=\d)", "", text)  # 5,00,000 -> 500000
    return clean(text, keep=".")


def _fmt(v: float) -> str:
    return str(int(v)) if float(v) == int(v) else str(v)


def numbers(text: str) -> set[str]:
    out = set()
    for m in _NUM.findall(normalize(text)):
        m = m.rstrip(".")
        out.add(m)
        if re.fullmatch(r"\d+\.0+", m):
            out.add(m.split(".")[0])
    return out


def _texts(n: dict[str, Any]) -> list[tuple[str, str]]:
    """(field, text) pairs scanned for numbers. Uncertain spans are excluded: they are flagged by design."""
    out = [("title", n.get("title", ""))] + [(f"summary[{i}]", s) for i, s in enumerate(n.get("summary", []))]
    for f in ("requirements", "decisions"):
        out += [(f"{f}[{i}]", x["text"]) for i, x in enumerate(n.get(f, []))]
    out += [(f"action_items[{i}]", f"{a['task']} {a.get('due') or ''}") for i, a in enumerate(n.get("action_items", []))]
    out += [(f"schedule[{i}]", f"{s['what']} {s['when']}") for i, s in enumerate(n.get("schedule", []))]
    return out


def _values(n: dict[str, Any]) -> list[tuple[str, float]]:
    out = []
    for i, it in enumerate(n.get("items", [])):
        out += [(f"items[{i}].{k}", it[k]) for k in ("quantity", "unit_price", "total_price") if it.get(k) is not None]
    out += [(f"stated_totals[{i}]", t["amount"]) for i, t in enumerate(n.get("stated_totals", []))]
    return out


def _names(n: dict[str, Any]) -> list[tuple[str, str]]:
    out = [(f"parties[{i}]", p["name"]) for i, p in enumerate(n.get("parties", []))]
    out += [(f"locations[{i}]", loc["name"]) for i, loc in enumerate(n.get("locations", []))]
    out += [(f"items[{i}].shop", it["shop"]) for i, it in enumerate(n.get("items", [])) if it.get("shop")]
    out += [(f"action_items[{i}].owner", a["owner"]) for i, a in enumerate(n.get("action_items", [])) if a.get("owner")]
    return out


CITED = ("requirements", "items", "stated_totals", "locations", "schedule", "decisions", "action_items",
         "uncertain_spans")


def check(note: dict[str, Any], segments: list[dict[str, Any]], names: list[str]) -> dict[str, Any]:
    """Return {flag_count, flags[], checked_count}. Never removes anything from the note."""
    corpus = normalize(" ".join(names + [s["text"] for s in segments]))
    known = numbers(corpus) | word_numbers(corpus)
    seqs = {s["seq"] for s in segments}
    flags: list[dict[str, Any]] = []
    checked = 0

    def miss(field: str, value: Any, reason: str = "not_found_in_transcript") -> None:
        flags.append({"field": field, "value": value, "reason": reason})

    for field, text in _texts(note):
        # times are spoken as "das baje" / "saade chaar baje": verify the hour (24 h or 12 h), not the minutes
        for h in _TIME.findall(ascii_digits(text)):
            checked += 1
            if not {h.lstrip("0") or "0", str(int(h) - 12)} & known:
                miss(field, f"{h}:xx")
        for num in numbers(_TIME.sub(" ", ascii_digits(text))):
            checked += 1
            if num not in known:
                miss(field, num)
    for field, v in _values(note):
        checked += 1
        if _fmt(v) not in known:
            miss(field, _fmt(v))
    for field, name in _names(note):
        checked += 1
        nn = normalize(name).strip()
        if nn and nn not in corpus and fuzz.partial_ratio(nn, corpus) < 90:
            miss(field, name)
    for f in CITED:
        for i, item in enumerate(note.get(f, [])):
            bad = [e for e in item.get("evidence", []) if e not in seqs]
            if bad:
                miss(f"{f}[{i}]", bad, "bad_evidence")

    costs = compute_costs(note)
    if costs["unpriced_items"] == 0 and costs["grand_total"] is not None:
        for i, t in enumerate(note.get("stated_totals", [])):
            shop = next((s for s in costs["by_shop"] if s["shop"] == t.get("shop")), None)
            computed = shop["subtotal"] if shop else costs["grand_total"]
            if abs(computed - t["amount"]) > 1:
                miss(f"stated_totals[{i}]", f"said ₹{_fmt(t['amount'])}, items add up to ₹{_fmt(computed)}",
                     "total_mismatch")
    return {"flag_count": len(flags), "flags": flags, "checked_count": checked}
