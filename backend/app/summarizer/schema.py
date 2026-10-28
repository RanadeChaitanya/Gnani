"""Note JSON schema (§12.2)."""
from typing import Any, Literal

from pydantic import BaseModel, Field


class Cited(BaseModel):
    text: str
    evidence: list[int] = Field(min_length=1)


class ActionItem(BaseModel):
    task: str
    owner: str | None = None
    due: str | None = None
    evidence: list[int] = Field(min_length=1)


class Entities(BaseModel):
    people: list[str] = []
    organizations: list[str] = []
    places: list[str] = []
    dates: list[str] = []
    amounts: list[str] = []


class Uncertain(BaseModel):
    text: str
    reason: str
    evidence: list[int] = Field(min_length=1)


class NoteContent(BaseModel):
    title: str = Field(max_length=80)
    note_language: Literal["en", "hi", "same"]
    summary: list[str] = Field(min_length=1, max_length=6)
    key_points: list[Cited] = []
    decisions: list[Cited] = []
    action_items: list[ActionItem] = []
    entities: Entities = Entities()
    open_questions: list[str] = []
    uncertain_spans: list[Uncertain] = []
    conversation_languages: list[str] = []


def json_schema() -> dict[str, Any]:
    return NoteContent.model_json_schema()
