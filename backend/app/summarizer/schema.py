"""Note JSON schema v2: structured for real conversations (orders, appointments, complaints)."""
from typing import Any, Literal

from pydantic import BaseModel, Field

Ev = Field(min_length=1, description="transcript line numbers (#N) that support this")


class Cited(BaseModel):
    text: str = Field(description="clear English (or requested language)")
    original: str | None = Field(None, description="the speaker's own words, quoted from the transcript")
    evidence: list[int] = Ev


class Party(BaseModel):
    name: str
    role: str = Field(description="e.g. customer, shopkeeper, doctor, patient, technician")


class Item(BaseModel):
    name: str = Field(description="product or service, in English (original word in brackets if Hindi)")
    quantity: float | None = None
    unit: str | None = Field(None, description="kg, g, litre, packet, dozen, piece …")
    unit_price: float | None = Field(None, description="price per unit in INR, only if said")
    total_price: float | None = Field(None, description="price for this line in INR, only if said")
    shop: str | None = Field(None, description="seller/shop name if said, else null")
    evidence: list[int] = Ev


class StatedTotal(BaseModel):
    amount: float = Field(description="a total in INR that a speaker actually said")
    shop: str | None = None
    evidence: list[int] = Ev


class Location(BaseModel):
    name: str = Field(description="address, landmark, area or city exactly as said")
    kind: Literal["delivery", "pickup", "meeting", "home", "shop", "clinic", "other"] = "other"
    evidence: list[int] = Ev


class ScheduleItem(BaseModel):
    what: str
    when: str = Field(description="as said, normalised: e.g. 'tomorrow 10:00', 'Thursday 16:30'")
    where: str | None = None
    evidence: list[int] = Ev


class ActionItem(BaseModel):
    task: str
    owner: str | None = None
    due: str | None = None
    evidence: list[int] = Ev


class Uncertain(BaseModel):
    text: str
    reason: str
    evidence: list[int] = Ev


class NoteContent(BaseModel):
    title: str = Field(max_length=80)
    note_language: Literal["en", "hi", "same"]
    conversation_type: Literal["order", "appointment", "complaint", "general"]
    summary: list[str] = Field(min_length=1, max_length=5)
    parties: list[Party] = []
    requirements: list[Cited] = Field([], description="what the customer/caller needs or asked for")
    items: list[Item] = []
    stated_totals: list[StatedTotal] = []
    locations: list[Location] = []
    schedule: list[ScheduleItem] = []
    decisions: list[Cited] = []
    action_items: list[ActionItem] = []
    open_questions: list[str] = []
    uncertain_spans: list[Uncertain] = []
    conversation_languages: list[str] = []


def json_schema() -> dict[str, Any]:
    return NoteContent.model_json_schema()


def compute_costs(note: dict[str, Any]) -> dict[str, Any]:
    """Totals are arithmetic, so code does them, not the LLM. Per shop: priced lines + subtotal."""
    shops: dict[str, dict[str, Any]] = {}
    for it in note.get("items", []):
        line = it.get("total_price")
        if line is None and it.get("unit_price") is not None and it.get("quantity") is not None:
            line = round(it["unit_price"] * it["quantity"], 2)
        s = shops.setdefault(it.get("shop") or "", {"shop": it.get("shop"), "subtotal": 0.0, "priced": 0, "unpriced": 0})
        if line is None:
            s["unpriced"] += 1
        else:
            s["subtotal"] = round(s["subtotal"] + line, 2)
            s["priced"] += 1
    by_shop = list(shops.values())
    priced = sum(s["priced"] for s in by_shop)
    return {"by_shop": by_shop, "grand_total": round(sum(s["subtotal"] for s in by_shop), 2) if priced else None,
            "unpriced_items": sum(s["unpriced"] for s in by_shop),
            "stated_totals": note.get("stated_totals", [])}
