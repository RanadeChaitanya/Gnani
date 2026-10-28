# PROGRESS

Resume guide: read `SPEC.md`, then this file. Backend: `cd backend && .venv/Scripts/python -m pytest` (Windows) or `.venv/bin/python`.

## Checkpoint A answers (2026-10-28)
| Item | Answer |
|---|---|
| GNANI_API_KEY | User will paste into `.env` (not in chat). **Still empty** as of last check. |
| Credits / silence billing | Unknown → ASSUMED: billed per audio second sent; we never stream silence while muted (pause stops forwarding). |
| LLM | **DeepSeek** via OpenAI-compatible API (`LLM_PROVIDER=openai_compat`, base `https://api.deepseek.com`, `LLM_MODEL=deepseek-chat` — ASSUMED model id, verify on first smoke). |
| Demo languages | **Hinglish (`en-IN`) + Marathi (`mr-IN`) + English**. Scenarios: kirana order, appointment booking (defaults). |
| Team | Two members; handles to collect at Checkpoint D. |

## Doc discrepancies (docs win)
- `x-format` default is `verbatim` in docs (spec implies transcribe); we send `transcribe` explicitly unless bias words are set.
- Docs default `x-vad-threshold` 0.7 / `x-min-silence-ms` 500; we send spec values 0.5 / 700 explicitly.
- `x-partials` only appears in a word-boosting sentence; not in the header table. `stt-websocket.yml` URL returns an HTML page, not YAML. → `STT_PARTIALS=false`; `smoke.py probe` tries the header live.
- STT REST: `POST https://api.vachana.ai/stt/v3`, header `X-API-Key-ID`, form fields `audio_file`, `language_code`, `format`. Response `{success, request_id, timestamp, transcript}`.
- TTS voices differ from spec: Timbre v2.5 voices are per-language (en-IN: Kaveri, Pranav…; hi-IN: Nalini, Deepak…; hi-en Hinglish: Poorvi; mr-IN: Zahira, Ishaan). Timbre v3.0 voices speak all 10 languages. `model` is required (`timbre-v2.5`/`timbre-v3.0`); `language` accepts `hi-en`.
- Bias words: Indic letters include combining marks (category M*), so "letters only" validation accepts L*+M* (first char L*).

## Deviations from spec (ponytail: smallest complete design)
- No Anthropic provider (user chose DeepSeek); providers = `openai_compat` + `mock` in one module. DeepSeek has no forced tool call → JSON mode (`response_format: json_object`) + schema in the system prompt (last line of spec prompt changed accordingly) + pydantic validation + 1 retry.
- `call_audio/` package → single `app/call_audio.py`. `api/notes.py` folded into `api/rooms.py`. `gnani/errors.py` not needed. Notice text in `app/notice.py`.
- Smoke scripts → one `scripts/smoke.py {tts|rest|ws|probe|llm|all}`.
- Budget exceeded → capture stops, room returns to `lobby` (not `ended`) so the users can still End and get the final note; `/start` then refuses with `budget`.
- Hard rotation (≥14:45) waits for the next `processing` (end of speech) so an utterance is never split across sockets; forced at 14:58. Found by test: rotating mid-speech lost that utterance.
- WS heartbeat: relies on uvicorn's protocol-level ping (20 s) instead of an app-level 15 s ping.

## Status
- [x] Phase 0 skeleton, `.env.example`, `.env` (random JWT secret), docs read, `scripts/smoke.py` written.
- [ ] Phase 0 smoke runs + probes (concurrency / idle / partials / credit meter) — **blocked on keys in `.env`**.
- [x] Phase 1 backend core: config, redacting JSON logs, SQLModel tables, JWT, rate limiter, header builder, pacer, rotating/reconnecting upstream, fake Gnani server, room hub (reorder + echo dedupe), STT proxy, rooms/consent API, summarizer + faithfulness, retention. **29 tests green** (`pytest`).
  - Pacer ±5 ms per-frame jitter is asserted only on Linux; Windows' asyncio timer has a 15.6 ms tick (mean cadence still asserted). Verify in Docker.

## Next
Phase 2–4 frontend (Vite React PWA): capture worklet, Solo mode, lobby/consent, call, captions, notes (IndexedDB).

## Open questions
- Concurrent STT sockets per key, idle timeout, partials, billing of silence → run `python backend/scripts/smoke.py probe` once the key is in.
