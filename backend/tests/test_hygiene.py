"""Phase 5 hygiene: no secrets in the client bundle; no secrets or transcript text in INFO logs."""
import logging
from pathlib import Path

import httpx
import pytest

from app.config import ROOT
from fake_gnani_server import FakeGnani
from test_integration import open_stt, setup_room, speak, wait_for

STATIC = ROOT / "backend" / "app" / "static"


@pytest.mark.skipif(not (STATIC / "index.html").exists(), reason="frontend not built")
def test_no_secrets_in_client_bundle() -> None:
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines() if (ROOT / ".env").exists() else []:
        k, _, v = line.partition("=")
        if k.endswith(("_KEY", "_SECRET")) and len(v.strip()) > 6:
            env[k] = v.strip()
    bundle = "".join(p.read_text(encoding="utf-8", errors="ignore") for p in Path(STATIC).rglob("*.js"))
    for k, v in env.items():
        assert v not in bundle, f"{k} leaked into the client bundle"
    for marker in ("x-api-key-id", "OPENAI_COMPAT_API_KEY", "LIVEKIT_API_SECRET", "GNANI_API_KEY"):
        assert marker not in bundle


async def test_logs_have_no_secrets_or_transcripts(server: str, fake: FakeGnani, caplog: pytest.LogCaptureFixture) -> None:
    secret_line = "Mera account number gupt hai"
    fake.scripts = {"en-IN": __import__("collections").deque([secret_line])}
    caplog.set_level(logging.INFO)
    async with httpx.AsyncClient() as c:
        code, host, _ = await setup_room(server, c)
        a, got = await open_stt(server, code, host["token"])
        await speak(a)
        await wait_for(lambda: any(m["type"] == "transcript" for m in got))
        await fake.drop_all()  # exercise the warning/reconnect log paths too
        await wait_for(lambda: any(m.get("state") == "connected" for m in got[-3:]))
    text = caplog.text + "".join(str(getattr(r, "data", "")) for r in caplog.records)
    assert secret_line not in text
    assert "test-key" not in text
    assert host["token"] not in text
