import asyncio
import os
import socket
import sys
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

os.environ.update({
    "LLM_PROVIDER": "mock", "CALL_AUDIO_PROVIDER": "none", "GNANI_API_KEY": "test-key", "JWT_SECRET": "test-secret-that-is-at-least-32-bytes-long",
    "LIVEKIT_URL": "", "RATE_LIMIT_PER_MIN": "1000", "ECHO_DEDUPE": "true", "STT_PARTIALS": "true",
})

from app import db  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.summarizer import service  # noqa: E402
from app.ws import room_hub  # noqa: E402
from fake_gnani_server import FakeGnani  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db(tmp_path: Path) -> Iterator[None]:
    get_settings.cache_clear()
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp_path / 'test.db'}"
    db.reset_engine()
    room_hub.hubs.clear()
    service.set_provider(None)
    yield
    db.reset_engine()


@pytest.fixture
async def fake() -> AsyncIterator[FakeGnani]:
    f = FakeGnani()
    url = await f.start()
    get_settings().gnani_ws_url_override = url
    yield f
    await f.stop()


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@pytest.fixture
async def server(fake: FakeGnani) -> AsyncIterator[str]:
    import uvicorn

    from app.main import app

    port = _free_port()
    srv = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="on"))
    task = asyncio.create_task(srv.serve())
    while not srv.started:
        await asyncio.sleep(0.05)
    yield f"127.0.0.1:{port}"
    srv.should_exit = True
    await task
