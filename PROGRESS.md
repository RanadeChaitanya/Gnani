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

## >>> CURRENT TASK (v3) — resume here if the session was cut off <<<
User feedback after v2 phone test (2026-10-28): Hindi recognition poor; UI cluttered; note should show *understanding* (structured), not translations; target near-100 % accuracy; say honestly whether limits are Gnani's or ours.
Evidence: test rooms 9L7E8R, LFFATE (backend/data/saar.db). Mics healthy. Errors: "dais"=das, "har bhara daur"=arhar dal?, "sandee"=santre/suji?, crosstalk (both phones in one room heard both voices → duplicate sugar 8 kg / 50 kg).
Steps (mark [x] as done, commit after each):
- [x] 1. v4 == v3 word-for-word (eval/results/v3_vs_v4.json): same model, no better key exists. Grocery A/B (eval/grocery_ab.py): hi-IN verbatim no-bias 97 %, en-IN no-bias 94 %, en-IN + v2 vocab 84 % (vocab HURT).
- [x] 2. DONE: drop scenario vocab (lexicon.py); hi-IN + en-IN use verbatim (Saar parses numbers); default language hi-IN "Hindi / Hinglish"; user-typed names still boosted.
- [x] 3. DONE (prompt v3, schema: outcome + heard_as, no quotes/requirements; real transcripts → arhar dal recovered, "Sugar: 8 kg or 50 kg?" asked). Was: DeepSeek v3 prompt: understand intent; correct misheard product names to likely words with `heard_as`; merge duplicates/crosstalk; no translation-only output.
- [ ] 4. Minimal UI: note = title, 1-line summary, items table, totals, when/where, one Share button; details hidden.
- [ ] 5. Tests green, rebuild, restart backend + tunnel (tunnel URL changes!), live check, commit, report.

## Phase 0 live findings (2026-10-28, real keys)
- TTS (Timbre v2.5: Kaveri en-IN, Nalini hi-IN, Zahira mr-IN) ✅ — but WAV headers carry streaming sizes (0xFFFFFFFF); `gnani/tts_client.fix_wav_header` rewrites them.
- STT REST ✅ en/hi/mr; ITN active (`दस बजे`→`10:00`, `दोन`→`2`).
- STT WebSocket ✅ en/hi/mr, Gnani latency 171–298 ms (direct), 86–121 ms through our proxy in the live room check.
- **Live API sends an undocumented `speech_start`** at speech onset and did **not** send the documented `processing`. Code treats either as "segment open"; hard rotation now triggers right after a `transcript`.
- **Concurrency: one key holds 2 concurrent sockets** ✅ (two-person room needs no second key).
- **Idle: socket still open after 60 s with no audio** ✅ (mute/pause keeps the connection).
- **`x-partials: true` works** ✅: `partial_transcript` (growing prefix) during speech, and the final arrives as **`final_transcript`** (not `transcript`). Now default on (`STT_PARTIALS=true`); partials are broadcast to both phones as live typing bubbles; finals normalized to `transcript`.
- DeepSeek (`deepseek-chat`, JSON mode) ✅ schema-valid note first try.
- Full live room check (2 participants, en-IN + mr-IN, real Gnani + real DeepSeek + LiveKit token): ordered segments, 15 partials, final note ready, 0 faithfulness flags, 0 server errors.
- Credit-meter probe (does muted silence bill?) not measurable from here — we never send silence anyway.

## LLM spend cap (user instruction: never exceed $0.20 on DeepSeek)
`LLM_BUDGET_USD=0.20`, ledger `data/llm_spend.json` shared by app/smoke/eval. Each call is refused **before** the request unless spent + worst case (input chars/2 tokens + full `max_tokens` output) at deliberately high prices ($0.60/M in, $2.20/M out) fits. Calls are serialized per process. Spent so far: **$0.0027** (2 notes). Budget per note ≈ $0.002–0.004 → E4 (36 notes) fits; keep ≥ $0.05 for the demo.

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
- [x] Phase 0 smoke runs + probes — all green with real keys (see "Phase 0 live findings").
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

## v2 (2026-10-28, after the first real two-phone test)
See `docs/IMPROVEMENTS_V2.md` (evidence → root causes → changes → status). Highlights: note schema v2 (items, per-shop totals computed in code, places, schedule, needs), prompt v2, Hinglish/Marathi number words, scenario word boosting for en-IN (measured −19 % relative WER), QR + one-tap consent/join + auto-start, call-style UI with mic meter and silent-mic warning, server audio-health logs, PDF/WhatsApp/CSV export, `/end` race fix, no IPs in logs.
Tests: backend 36, frontend 12, e2e 2 — all green. LLM spend $0.011 / $0.20.
Dev DB `backend/data/saar.db` was deleted for the v2 schema (adds `rooms.scenario`; no migrations — data is 24 h-ephemeral by design).

## Next (blocked on human)
1. ~~Keys + smoke~~ done.
2. Checkpoint B: LiveKit Cloud creds + HTTPS route for phones (cloudflared) → real two-phone test (`docs/DEVICE_TEST.md`).
3. Checkpoint C: eval budget, real clips (optional) → `make_audio.py`, `run_eval.py`, `report.py`.
4. Start Docker Desktop → `docker compose up --build`; run pacer test in Linux container for the ±5 ms check.
5. Checkpoint D: deploy target, repo URL, handles → README team table, SUBMISSION.md.

## Open questions
- Billing of silence: unknown (we never send it).
- Hindi notice wording needs a human review before shipping (spec §13.2).
