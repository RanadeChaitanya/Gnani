"""SQLModel tables (§10). Text only — never audio."""
import uuid
from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def now() -> datetime:
    return datetime.now(timezone.utc)


def uid() -> str:
    return uuid.uuid4().hex


class Room(SQLModel, table=True):
    __tablename__ = "rooms"
    id: str = Field(default_factory=uid, primary_key=True)
    code: str = Field(unique=True, index=True)
    status: str = "lobby"  # lobby | active | ended
    solo: bool = False
    scenario: str = "general"  # shop | appointment | complaint | general
    created_at: datetime = Field(default_factory=now)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    host_participant_id: str = ""
    notice_version: str = ""
    demo_mode: bool = True


class Participant(SQLModel, table=True):
    __tablename__ = "participants"
    id: str = Field(default_factory=uid, primary_key=True)
    room_id: str = Field(index=True)
    display_name: str
    role: str  # host | guest
    lang_code: str
    notes_lang: str = "en"
    bias_words_json: str = "[]"
    consent: str = "none"  # none | granted | revoked
    joined_at: datetime = Field(default_factory=now)
    left_at: datetime | None = None


class Consent(SQLModel, table=True):
    __tablename__ = "consents"
    id: str = Field(default_factory=uid, primary_key=True)
    room_id: str = Field(index=True)
    participant_id: str
    action: str
    notice_version: str
    notice_sha256: str
    at: datetime = Field(default_factory=now)


class Segment(SQLModel, table=True):
    __tablename__ = "segments"
    id: str = Field(default_factory=uid, primary_key=True)
    room_id: str = Field(index=True)
    participant_id: str
    upstream_segment_id: str
    local_index: int
    seq: int | None = None
    text: str
    started_at: float  # server epoch seconds
    ended_at: float
    audio_ms: int
    latency_ms: int
    possible_echo: bool = False


class Note(SQLModel, table=True):
    __tablename__ = "notes"
    id: str = Field(default_factory=uid, primary_key=True)
    room_id: str = Field(index=True)
    kind: str  # quick | final
    status: str = "pending"  # pending | ready | failed
    created_at: datetime = Field(default_factory=now)
    model: str = ""
    prompt_version: str = ""
    note_json: str = ""
    faithfulness_json: str = ""
    error: str = ""
    reviews_json: str = "{}"  # participant_id -> "confirmed"; reset whenever the note is revised
    corrections_json: str = "[]"  # [{"name", "text"}] from the review step, fed back into the prompt


class Usage(SQLModel, table=True):
    __tablename__ = "usage"
    id: str = Field(default_factory=uid, primary_key=True)
    room_id: str = Field(index=True)
    participant_id: str = ""
    stt_audio_seconds: float = 0
    stt_segments: int = 0
    llm_input_tokens: int = 0
    llm_output_tokens: int = 0
    reconnects: int = 0
    dropped_frames: int = 0
