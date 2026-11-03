"""FastAPI app: REST, WebSockets, security headers, SPA static files, retention task."""
import asyncio
import contextlib
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.exceptions import HTTPException

from .api import calls, health, notion, rooms
from .config import get_settings
from .db import engine
from .logging import setup_logging
from .retention import retention_loop
from .ws.room_hub import room_ws
from .ws.stt_proxy import stt_ws

STATIC = Path(__file__).parent / "static"


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    setup_logging(get_settings().log_level)
    engine()
    task = asyncio.create_task(retention_loop())
    yield
    task.cancel()


app = FastAPI(title="Saar", lifespan=lifespan, docs_url=None, redoc_url=None)
app.include_router(health.router)
app.include_router(rooms.router)
app.include_router(calls.router)
app.include_router(notion.router)


def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


@app.exception_handler(rooms.ApiError)
async def _api_error(_: Request, e: rooms.ApiError) -> JSONResponse:
    return _err(e.status, e.code, e.message)


@app.exception_handler(RequestValidationError)
async def _validation(_: Request, e: RequestValidationError) -> JSONResponse:
    first = e.errors()[0] if e.errors() else {}
    return _err(422, "invalid_request", str(first.get("msg", "Invalid request")).removeprefix("Value error, "))


@app.exception_handler(HTTPException)
async def _http(_: Request, e: HTTPException) -> JSONResponse:
    return _err(e.status_code, "http_error", str(e.detail))


@app.exception_handler(Exception)
async def _unhandled(_: Request, e: Exception) -> JSONResponse:
    return _err(500, "internal", "Something went wrong")  # no stack traces to clients


@app.middleware("http")
async def security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    resp = await call_next(request)
    lk = get_settings().livekit_url
    lk_http = lk.replace("wss://", "https://") if lk else ""
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        f"connect-src 'self' ws: wss: {lk} {lk_http}; media-src 'self' blob:; worker-src 'self' blob:; "
        "frame-ancestors 'none'")
    resp.headers["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=()"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.websocket("/ws/room/{code}")
async def ws_room(ws: WebSocket, code: str) -> None:
    await room_ws(ws, code.upper())


@app.websocket("/ws/inbox")
async def ws_inbox(ws: WebSocket) -> None:
    await calls.inbox_ws(ws)


@app.websocket("/ws/stt/{code}")
async def ws_stt(ws: WebSocket, code: str) -> None:
    await stt_ws(ws, code.upper())


@app.get("/{path:path}", include_in_schema=False)
async def spa(path: str) -> Response:
    if path.startswith("api/"):
        return _err(404, "not_found", "Not found")
    f = (STATIC / path).resolve()
    if path and f.is_file() and STATIC.resolve() in f.parents:
        return FileResponse(f)
    index = STATIC / "index.html"
    if index.is_file():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return _err(404, "not_found", "Frontend not built (run npm run build in frontend/)")
