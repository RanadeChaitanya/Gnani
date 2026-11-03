"""Note generation: build prompt from ordered segments, call LLM, validate (1 retry), faithfulness, broadcast."""
import asyncio
import json
import logging
from typing import Any

from pydantic import ValidationError
from sqlmodel import col, select

from ..config import get_settings
from ..db import session
from ..models import Note, Participant, Room, Segment, Usage
from ..ws.room_hub import get_hub
from . import faithfulness, prompts
from .providers import BudgetExceeded, LLMProvider, make_provider
from .schema import NoteContent, compute_costs, json_schema

log = logging.getLogger("saar.notes")
_provider: LLMProvider | None = None
_tasks: set[asyncio.Task[None]] = set()


def provider() -> LLMProvider:
    global _provider
    if _provider is None:
        _provider = make_provider(get_settings())
    return _provider


def set_provider(p: LLMProvider | None) -> None:
    """Tests: inject a provider."""
    global _provider
    _provider = p


def room_segments(room_id: str) -> list[dict[str, Any]]:
    """Flushed, non-echo segments in seq order, with speaker names."""
    with session() as s:
        names = {p.id: p.display_name for p in s.exec(select(Participant).where(Participant.room_id == room_id))}
        rows = s.exec(select(Segment).where(Segment.room_id == room_id, col(Segment.seq).is_not(None),
                                            Segment.possible_echo == False)  # noqa: E712
                      .order_by(col(Segment.seq))).all()
    return [{"seq": r.seq, "participant_id": r.participant_id, "name": names.get(r.participant_id, "?"),
             "text": r.text, "started_at": r.started_at} for r in rows]


def note_payload(note: Note, room: Room) -> dict[str, Any]:
    with session() as s:
        parts = s.exec(select(Participant).where(Participant.room_id == room.id)
                       .order_by(col(Participant.joined_at))).all()
    reviews = json.loads(note.reviews_json or "{}")
    return {
        "review": {"by": {p.id: reviews.get(p.id, "pending") for p in parts},
                   "final": note.status == "ready" and bool(parts) and all(reviews.get(p.id) == "confirmed" for p in parts),
                   "corrections": json.loads(note.corrections_json or "[]")},
        "id": note.id, "room_code": room.code, "kind": note.kind, "status": note.status,
        "created_at": note.created_at.isoformat(), "model": note.model, "error": note.error,
        "participants": [p.display_name for p in parts], "langs": sorted({p.lang_code for p in parts}),
        "note": json.loads(note.note_json) if note.note_json else None,
        "costs": compute_costs(json.loads(note.note_json)) if note.note_json else None,
        "faithfulness": json.loads(note.faithfulness_json) if note.faithfulness_json else None,
        "transcript": room_segments(room.id),
    }


def revise_note(note: Note, room: Room) -> None:
    """Regenerate after a participant's correction (the row keeps its id, so both phones update in place)."""
    t = asyncio.ensure_future(_generate(note.id, room))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


def start_note(room: Room, kind: str, warning: str = "") -> Note:
    """Create a pending note row and generate it in the background."""
    with session() as s:
        note = Note(room_id=room.id, kind=kind, prompt_version=prompts.PROMPT_VERSION, error=warning)
        s.add(note)
        s.commit()
    t = asyncio.ensure_future(_generate(note.id, room))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return note


async def _generate(note_id: str, room: Room) -> None:
    st = get_settings()
    hub = get_hub(room.code)
    await hub.broadcast({"type": "note_status", "note_id": note_id, "status": "pending"})
    await hub.flush(force=True)  # include segments still in the reorder buffer
    segs = room_segments(room.id)
    with session() as s:
        parts = s.exec(select(Participant).where(Participant.room_id == room.id)
                       .order_by(col(Participant.joined_at))).all()
    host = next((p for p in parts if p.role == "host"), parts[0])
    with session() as s:
        row = s.get(Note, note_id)
        corrections = json.loads(row.corrections_json) if row else []
    p = provider()
    system = prompts.system_prompt(json_schema())
    user = prompts.user_prompt(host.notes_lang, [{"name": x.display_name, "lang_code": x.lang_code} for x in parts],
                               prompts.transcript_lines(segs, st.max_transcript_chars), room.scenario, corrections)
    content: NoteContent | None = None
    err = ""
    tokens = {"input_tokens": 0, "output_tokens": 0}
    for attempt in range(2):
        try:
            raw, u = await p.generate_note(system, user, max_tokens=st.note_max_tokens, timeout_s=60)
            tokens = {k: tokens[k] + u.get(k, 0) for k in tokens}
            content = NoteContent.model_validate(raw)
            break
        except BudgetExceeded:
            err = "The note budget for this prototype is used up; the transcript is kept."
            break
        except ValidationError as e:
            err = "The note did not match the expected format."
            user += f"\n\nYour previous answer failed validation:\n{str(e)[:1500]}\nReturn corrected JSON only."
        except Exception as e:  # network/HTTP/JSON errors
            log.warning("llm call failed", extra={"data": {"attempt": attempt, "err": type(e).__name__}})
            err = "The summary service could not be reached."
    with session() as s:
        note = s.get(Note, note_id)
        if note is None:  # data deleted meanwhile
            return
        note.model = p.model
        if content:
            nd = content.model_dump()
            note.note_json = json.dumps(nd, ensure_ascii=False)
            note.faithfulness_json = json.dumps(
                faithfulness.check(nd, segs, [x.display_name for x in parts]), ensure_ascii=False)
            note.status = "ready"
        else:
            note.status, note.error = "failed", err
        s.add(note)
        s.add(Usage(room_id=room.id, llm_input_tokens=tokens["input_tokens"],
                    llm_output_tokens=tokens["output_tokens"]))
        s.commit()
    await hub.broadcast({"type": "note_status", "note_id": note_id, "status": note.status})
    await hub.broadcast({"type": "note_ready", "note": note_payload(note, room)})
