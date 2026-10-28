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

- [x] Phases 2–4 frontend (`frontend/`): Vite + React 18 PWA. AudioWorklet resampler (FIR + interp, tested for aliasing) and exact 1,024-byte framing; Home/Setup/Room (lobby + consent + call + captions)/Notes/NoteDetail/Privacy; EN+HI strings; LiveKit call (lazy-loaded); IndexedDB notes with search, rename, Markdown export, share, delete; evidence chips; ⚠ flags; wake lock; background pause; iOS "tap to hear".
  - Vitest: 11 tests. **Playwright e2e: 2 tests green** (two contexts with fake mics → real worklet → proxy → fake Gnani; consent gating, captions on both, quick note in Notes, revoke stops both, delete, room full). Screenshots in `docs/screenshots/`.
- [x] Phase 5 hardening (partial): CSP/Permissions-Policy/no-store headers, rate limits, retention job, redaction, secrets-not-in-bundle test, no-secrets/no-transcripts-in-logs test, mypy --strict clean, ruff clean. PWA SW caches the app shell only (`/api`, `/ws` excluded). **31 backend tests green.**
- [x] Phase 6 harness written (`eval/`): 9 seed dialogues, TTS generation, 18 degradations (self-tested), E1/E2/E4 runner with plan/budget guard/cache, report + charts. **Not run yet — needs the Gnani key, and the default plan (~57 min audio) is over the 20 min default budget → Checkpoint C decision.**
- [x] Phase 7 drafts: Dockerfile (multi-stage) + compose (optional local LiveKit profile), README, docs/{ARCHITECTURE, CONSENT_AND_PRIVACY, LIMITATIONS, DEMO_SCRIPT, DEVICE_TEST, SUBMISSION}.md.
  - Docker image **not built yet**: Docker Desktop daemon was not running.

## Deviations (frontend)
- Tailwind/zustand not used: one CSS file with variables (light/dark), React state. Lobby + Call are one `Room.tsx` (shared sockets). Playwright lives in `frontend/e2e/` (needs frontend node_modules).
- E3/E5 cut (spec §16.9 item 2). Seed dataset is 9 hand-written dialogues (spec asks 24–36; extend with LLM drafts + human review).
- Echo heuristic can only hide the later segment of a pair (comment in code).

## Next (blocked on human)
1. Keys in `.env` → `python backend/scripts/smoke.py all` (TTS → REST → WS → probes → LLM). Record concurrency / idle / partials results here.
2. Checkpoint B: LiveKit Cloud creds + HTTPS route for phones (cloudflared) → real two-phone test (`docs/DEVICE_TEST.md`).
3. Checkpoint C: eval budget, real clips (optional) → `make_audio.py`, `run_eval.py`, `report.py`.
4. Start Docker Desktop → `docker compose up --build`; run pacer test in Linux container for the ±5 ms check.
5. Checkpoint D: deploy target, repo URL, handles → README team table, SUBMISSION.md.

## Open questions
- Concurrent STT sockets per key, idle timeout, partials, billing of silence → `smoke.py probe`.
- Hindi notice wording needs a human review before shipping (spec §13.2).
