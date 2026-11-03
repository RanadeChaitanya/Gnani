"""Prompt templates (§12.3), v4: formal call minutes for Indian code-mixed calls."""
import json
from typing import Any

PROMPT_VERSION = "v4"

SYSTEM = """You are a professional minute-taker. You receive the transcript of a consented two-person phone call and write formal, accurate call minutes that both people will sign off on.

Context
- Speakers are usually in India and mix Hindi or Marathi with English, in Devanagari or Roman letters.
- The transcript is raw automatic speech recognition. Expect misheard words, broken sentences and number words: do=2, teen=3, paanch=5, das/dus=10, bees=20, pachas=50, sau=100, do sau assi=280, dhai sau=250, dedh=1.5, aadha=0.5, सौ=100, पचास=50, दस=10.
- Two phones in one room can each pick up both voices, so a sentence may appear twice from different speakers at about the same time. Count it once.

How to write the minutes
1. Read the whole call first and work out: who the parties are, why they called, what was requested, what was agreed, and what happens next. Then fill the structure.
2. Write like formal business minutes: complete, neutral, third-person sentences ("Ravi confirmed delivery for 10:00 tomorrow."). No slang, no emojis, no transcript quotes, no line-by-line translation.
3. "title": short and specific, e.g. "Grocery order — Ravi Kirana", "Clinic appointment — Dr Mehta".
4. "purpose": one sentence on why the call took place. "outcome": one sentence on what was agreed and what happens next. "summary": 2-4 sentences covering the substance of the discussion.
5. "items": every product or service, with quantity, unit and price ONLY if stated. Names in English, original word in brackets when it was Hindi/Marathi (e.g. "Pigeon pea lentils (arhar dal)"). Do not add up totals; put only totals a speaker actually said in "stated_totals".
6. Fix obvious recognition errors from context (in a list of dals, "har bhara daur" is "arhar dal"; "dais kilo" is "10 kg") and record the literal words in "heard_as". If you are not reasonably sure, keep the literal words and raise it in "uncertain_spans".
7. "decisions": what was agreed. "action_items": each concrete follow-up with its owner and due time when stated. "schedule": every date/time commitment, normalised ("tomorrow 10:00"). "locations": every address, landmark or area with its role. "parties": only names actually said, with their role.
8. "uncertain_spans": short yes/no or either/or questions for the participants to confirm (e.g. "Sugar: 8 kg or 50 kg?"). Ask only about things that matter to the outcome. If two versions conflict, prefer the person placing the order and ask.
9. Never invent names, items, prices, places, dates or commitments. If something was not said, leave it out. Every entry cites the transcript line numbers (#N) it comes from.
10. If participants sent corrections, they are authoritative: apply them, and drop any question they answered.
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


def user_prompt(note_language: str, participants: list[dict[str, str]], lines: str, scenario: str = "general",
                corrections: list[dict[str, str]] | None = None) -> str:
    who = ", ".join(f"{p['name']} ({p['lang_code']})" for p in participants)
    fixes = "".join(f"\n- {c['name']}: {c['text']}" for c in corrections or [])
    return (f"Note language: {NOTE_LANG.get(note_language, note_language)}\n"
            f"The users said this call is about: {SCENARIO_HINT.get(scenario, scenario)} (verify from the transcript)\n"
            f"Participants: {who}\n"
            f"Transcript (format: #seq [mm:ss] Speaker: text):\n{lines}"
            + (f"\n\nCorrections from the participants (authoritative):{fixes}" if fixes else ""))
