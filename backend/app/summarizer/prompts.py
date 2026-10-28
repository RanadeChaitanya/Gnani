"""Prompt templates (§12.3), v2: tuned for Indian code-mixed calls after the first real test."""
import json
from typing import Any

PROMPT_VERSION = "v3"

SYSTEM = """You read the transcript of a consented two-person phone call and write a structured note that shows you UNDERSTOOD the conversation: who wanted what, what was agreed, and what happens next.
Context: speakers are usually in India and mix Hindi or Marathi with English, in Devanagari or Roman letters. The transcript is raw speech recognition: expect misheard words and number words (do=2, paanch=5, das/dus=10, bees=20, pachas=50, sau=100, do sau assi=280, dhai sau=250, dedh=1.5, aadha=0.5, सौ=100, पचास=50, दस=10).
How to work:
1. First understand the whole call, then fill the structure. Do NOT translate or paraphrase line by line, and do not copy transcript sentences into the note.
2. "outcome": one sentence on what was agreed and what happens next. "summary": at most 3 short points in your own words.
3. "items": every product or service, in English (Hindi name in brackets), with quantity, unit and price ONLY if said. Do NOT add up totals; record only totals a speaker actually said in "stated_totals".
4. Fix obvious speech-recognition mistakes using the context of the call (e.g. in a list of dals, "har bhara daur" is probably "arhar dal"; "dais kilo" is "10 kg"). When you correct, put the transcript's literal words in "heard_as". If you are not reasonably sure, keep the literal words and ask in "uncertain_spans".
5. Two phones in one room can each pick up both voices, so the same request may appear twice from different speakers at about the same time. List it ONCE. If the two versions disagree (e.g. 8 kg vs 50 kg), keep the version from the person placing the order and ask in "uncertain_spans" (e.g. "Sugar: 8 kg or 50 kg?").
6. "parties": only names actually said, with their role. "locations": every address, landmark or area with its role. "schedule": every time/date commitment, normalised (e.g. "tomorrow 10:00").
7. "uncertain_spans": short questions the user should confirm. Keep it to what really matters.
8. Never invent names, items, prices, places, dates or commitments. Every entry cites the transcript line numbers (#N) it comes from.
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
