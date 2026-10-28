"""Prompt templates (§12.3)."""
import json
from typing import Any

PROMPT_VERSION = "v1"

# Spec wording, except the last line: DeepSeek has no forced tool call, so we ask for schema-shaped JSON.
SYSTEM = """You turn a transcript of a consented two-person phone conversation into a faithful, concise note.
The transcript comes from automatic speech recognition and may contain errors, especially for names, numbers, and mixed-language (code-mixed) speech.
Rules:
1. Use ONLY information present in the transcript. Never invent names, numbers, dates, amounts, or commitments.
2. If something is unclear, garbled, or contradictory, do not guess: add it to "uncertain_spans" with a short reason.
3. Every key point, decision, action item, and uncertain span must cite the transcript line numbers (the #N markers) that support it.
4. Preserve numbers, currency, dates, and names exactly as they appear in the transcript.
5. Keep the speaker's mix of languages where quoting; write the note in the requested note language.
6. Be brief. Do not add advice, opinions, or emotional interpretation.
Return ONLY a json object that matches this JSON schema (no prose, no code fences):
"""

NOTE_LANG = {"en": "en (English)", "hi": "hi (Hindi, Devanagari)", "same": "same (the language(s) of the conversation)"}


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
    head, tail = [], []
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


def user_prompt(note_language: str, participants: list[dict[str, str]], lines: str) -> str:
    who = ", ".join(f"{p['name']} ({p['lang_code']})" for p in participants)
    return (f"Note language: {NOTE_LANG.get(note_language, note_language)}\n"
            f"Participants: {who}\n"
            f"Transcript (format: #seq [mm:ss] Speaker: text):\n{lines}")
