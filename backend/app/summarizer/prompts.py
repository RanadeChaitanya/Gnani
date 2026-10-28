"""Prompt templates (§12.3), v2: tuned for Indian code-mixed calls after the first real test."""
import json
from typing import Any

PROMPT_VERSION = "v2"

SYSTEM = """You turn a transcript of a consented two-person phone conversation into a faithful, useful note.
Context: speakers are usually in India and mix Hindi or Marathi with English, written in Roman letters (Hinglish) or Devanagari. The transcript is literal speech recognition, so expect misheard words, and number words written out (do=2, teen=3, paanch=5, das/dus=10, bees=20, pachas=50, sau=100, do sau assi=280, dhai sau=250, dedh=1.5, saade teen=3.5, hazaar=1000, lakh=100000; Marathi: दोन=2, पाच=5, दहा=10, शंभर=100).
Rules:
1. Use ONLY information in the transcript. Never invent names, items, prices, places, dates, or commitments.
2. Write in clear, simple English (unless another note language is requested). Convert number words to digits. In "requirements" and "decisions", put the speaker's own words in "original".
3. Extract every product/service mentioned into "items" with quantity, unit and price ONLY if said. Put a shop/seller name in "shop" only if said. Do NOT add up totals yourself: record only totals a speaker actually said in "stated_totals".
4. "locations": every address, landmark, area, or city mentioned, with its role (delivery, pickup, meeting, home, shop, clinic, other).
5. "parties": only people or businesses whose NAME is actually said, with their role; never invent labels like "Shop (unnamed)".
6. "schedule": every time/date commitment (deliveries, appointments, visits, calls back).
7. If a phrase is garbled or ambiguous, do not guess: add it to "uncertain_spans" with a short reason. Prefer fewer, correct entries over many guesses.
8. Every entry must cite the transcript line numbers (#N) it comes from.
9. Be brief. No advice or opinions.
Return ONLY a json object that matches this JSON schema (no prose, no code fences):
"""

NOTE_LANG = {"en": "en (English)", "hi": "hi (Hindi, Devanagari)", "same": "same (the language(s) of the conversation)"}
SCENARIO_HINT = {"shop": "a shop / grocery order", "appointment": "booking an appointment",
                 "complaint": "a service complaint", "general": "a general conversation"}


def system_prompt(schema: dict[str, Any]) -> str:
    return SYSTEM + json.dumps(schema, separators=(",", ":"))


def transcript_lines(segments: list[dict[str, Any]], max_chars: int) -> str:
    """`#seq [mm:ss] Speaker: text`, truncated from the middle if too long."""
    if not segments:
        return ""
    t0 = segments[0]["started_at"]
    lines = []
    for s in segments:
        sec = max(0, int(s["started_at"] - t0))
        lines.append(f"#{s['seq']} [{sec // 60:02d}:{sec % 60:02d}] {s['name']}: {s['text']}")
    text = "\n".join(lines)
    if len(text) <= max_chars:
        return text
    head: list[str] = []
    tail: list[str] = []
    budget = max_chars // 2
    for ln in lines:
        if sum(len(x) + 1 for x in head) + len(ln) > budget:
            break
        head.append(ln)
    for ln in reversed(lines):
        if sum(len(x) + 1 for x in tail) + len(ln) > budget:
            break
        tail.insert(0, ln)
    return "\n".join(head + ["[… middle of transcript omitted for length …]"] + tail)


def user_prompt(note_language: str, participants: list[dict[str, str]], lines: str, scenario: str = "general") -> str:
    who = ", ".join(f"{p['name']} ({p['lang_code']})" for p in participants)
    return (f"Note language: {NOTE_LANG.get(note_language, note_language)}\n"
            f"The users said this call is about: {SCENARIO_HINT.get(scenario, scenario)} (verify from the transcript)\n"
            f"Participants: {who}\n"
            f"Transcript (format: #seq [mm:ss] Speaker: text):\n{lines}")
