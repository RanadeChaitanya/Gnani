"""LLM providers. Each returns (note_dict, usage) where usage = {"input_tokens", "output_tokens"}."""
import json
import re
from typing import Any, Protocol

import httpx

from ...config import Settings


class LLMProvider(Protocol):
    model: str

    async def generate_note(self, system: str, user: str, *, max_tokens: int,
                            timeout_s: float) -> tuple[dict[str, Any], dict[str, int]]: ...


class OpenAICompatProvider:
    """Any OpenAI-compatible /chat/completions endpoint (DeepSeek by default) in JSON mode."""

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self.base_url, self.api_key, self.model = base_url.rstrip("/"), api_key, model

    async def generate_note(self, system: str, user: str, *, max_tokens: int,
                            timeout_s: float) -> tuple[dict[str, Any], dict[str, int]]:
        body = {"model": self.model, "temperature": 0.1, "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        async with httpx.AsyncClient(timeout=timeout_s) as c:
            r = await c.post(f"{self.base_url}/chat/completions", json=body,
                             headers={"Authorization": f"Bearer {self.api_key}"})
        r.raise_for_status()
        data = r.json()
        content = data["choices"][0]["message"]["content"] or ""
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
        u = data.get("usage") or {}
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
        note = {
            "title": "Conversation note",
            "note_language": "en",
            "summary": [f"{who}: {text}"[:120] for _, who, text in lines[:3]] or ["(no speech captured)"],
            "key_points": [{"text": text[:120], "evidence": [int(n)]} for n, _, text in lines[:3]],
            "decisions": [], "action_items": [],
            "entities": {"people": sorted({who for _, who, _ in lines}), "organizations": [], "places": [],
                         "dates": [], "amounts": []},
            "open_questions": [], "uncertain_spans": [],
            "conversation_languages": sorted(set(re.findall(r"\((\w\w-IN)\)", user))),
        }
        if not lines:
            note["key_points"] = [{"text": "No transcript", "evidence": seqs}]
        return note, {"input_tokens": len(user) // 4, "output_tokens": 200}


def make_provider(s: Settings) -> LLMProvider:
    if s.llm_provider == "mock":
        return MockProvider()
    if s.llm_provider == "openai_compat":
        return OpenAICompatProvider(s.openai_compat_base_url, s.openai_compat_api_key, s.llm_model)
    raise ValueError(f"unsupported LLM_PROVIDER {s.llm_provider!r} (use openai_compat or mock)")
