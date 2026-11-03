"""LLM providers. Each returns (note_dict, usage) where usage = {"input_tokens", "output_tokens"}."""
import asyncio
import json
import re
from pathlib import Path
from typing import Any, Protocol

import httpx

from ...config import Settings


class LLMProvider(Protocol):
    model: str

    async def generate_note(self, system: str, user: str, *, max_tokens: int,
                            timeout_s: float) -> tuple[dict[str, Any], dict[str, int]]: ...


class BudgetExceeded(Exception):
    pass


class SpendLedger:
    """Persistent USD spend counter. A call is refused unless its worst case (input + full max_tokens) fits."""

    def __init__(self, path: str, budget_usd: float, price_in_per_m: float, price_out_per_m: float) -> None:
        self.path, self.budget = Path(path), budget_usd
        self.pin, self.pout = price_in_per_m / 1e6, price_out_per_m / 1e6

    def spent(self) -> float:
        try:
            return float(json.loads(self.path.read_text())["usd"])
        except (FileNotFoundError, ValueError, KeyError):
            return 0.0

    def check(self, est_in: int, max_out: int) -> None:
        worst = est_in * self.pin + max_out * self.pout
        if self.spent() + worst > self.budget:
            raise BudgetExceeded(f"LLM budget ${self.budget:.2f} reached (spent ${self.spent():.4f})")

    def record(self, tokens_in: int, tokens_out: int) -> None:
        # shortcut: read-modify-write without a file lock; app and eval running at the same instant could
        # under-count one call. Upgrade to a lock file if they ever run concurrently.
        usd = self.spent() + tokens_in * self.pin + tokens_out * self.pout
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({"usd": round(usd, 6), "budget": self.budget}))


class OpenAICompatProvider:
    """Any OpenAI-compatible /chat/completions endpoint (DeepSeek by default) in JSON mode, behind a spend cap."""

    def __init__(self, base_url: str, api_key: str, model: str, ledger: SpendLedger) -> None:
        self.base_url, self.api_key, self.model = base_url.rstrip("/"), api_key, model
        self.ledger = ledger
        self._lock = asyncio.Lock()  # serialize calls so concurrent checks can't overshoot the cap

    async def generate_note(self, system: str, user: str, *, max_tokens: int,
                            timeout_s: float) -> tuple[dict[str, Any], dict[str, int]]:
        body = {"model": self.model, "temperature": 0.1, "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        est_in = (len(system) + len(user)) // 2 + 50  # generous: ~2 chars/token, Devanagari included
        async with self._lock:
            self.ledger.check(est_in, max_tokens)
            async with httpx.AsyncClient(timeout=timeout_s) as c:
                r = await c.post(f"{self.base_url}/chat/completions", json=body,
                                 headers={"Authorization": f"Bearer {self.api_key}"})
            u = (r.json().get("usage") if r.is_success else None) or {}
            self.ledger.record(u.get("prompt_tokens", est_in if r.is_success else 0),
                               u.get("completion_tokens", max_tokens if r.is_success else 0))
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"] or ""
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
        return json.loads(content), {"input_tokens": u.get("prompt_tokens", 0),
                                     "output_tokens": u.get("completion_tokens", 0)}


class MockProvider:
    """Deterministic notes for tests/offline dev. `responses` (if given) are returned in order first."""

    model = "mock"

    def __init__(self, responses: list[dict[str, Any]] | None = None) -> None:
        self.responses = list(responses or [])
        self.calls: list[str] = []

    async def generate_note(self, system: str, user: str, *, max_tokens: int,
                            timeout_s: float) -> tuple[dict[str, Any], dict[str, int]]:
        self.calls.append(user)
        if self.responses:
            return self.responses.pop(0), {"input_tokens": 0, "output_tokens": 0}
        lines = re.findall(r"^#(\d+) \[[\d:]+\] ([^:]+): (.*)$", user, re.M)
        seqs = [int(n) for n, _, _ in lines] or [1]
        note: dict[str, Any] = {
            "title": "Conversation note", "note_language": "en", "conversation_type": "general",
            "purpose": "Mock call (no LLM).",
            "outcome": "Mock note (no LLM).",
            "summary": [f"{who}: {text}"[:120] for _, who, text in lines[:3]] or ["(no speech captured)"],
            "parties": [{"name": who, "role": "participant"} for who in sorted({w for _, w, _ in lines})],
            "items": [], "stated_totals": [], "locations": [], "schedule": [],
            "decisions": [{"text": text[:120], "evidence": [int(n)]} for n, _, text in lines[:2]]
            or [{"text": "No transcript", "evidence": seqs}],
            "action_items": [], "uncertain_spans": [],
            "conversation_languages": sorted(set(re.findall(r"\((\w\w-IN)\)", user))),
        }
        return note, {"input_tokens": len(user) // 4, "output_tokens": 200}


def make_provider(s: Settings) -> LLMProvider:
    if s.llm_provider == "mock":
        return MockProvider()
    if s.llm_provider == "openai_compat":
        return OpenAICompatProvider(s.openai_compat_base_url, s.openai_compat_api_key, s.llm_model,
                                    SpendLedger(s.llm_ledger_path, s.llm_budget_usd, s.llm_price_in_per_m,
                                                s.llm_price_out_per_m))
    raise ValueError(f"unsupported LLM_PROVIDER {s.llm_provider!r} (use openai_compat or mock)")
