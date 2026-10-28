# SAAR — Consent-First Live Call Notes (Master Build Spec for Claude Code)

> **How to use this file.** Save it in an empty repo as `SPEC.md` (and copy it to `CLAUDE.md` so every new session reloads it). Launch with:
> `claude "Read SPEC.md completely. Then follow section 0 and start Phase 0."`
> This file is the single source of truth. If something here conflicts with a guess you would make, this file wins. If something here conflicts with the *official docs linked in §2*, the **docs win** and you record the discrepancy in `PROGRESS.md`.

---

## 0. Mission and operating rules

### 0.1 What we are building
**Saar** (Hindi *सार*, "essence") is a mobile-first web app (installable PWA) in which **two people on two phones hold a live voice call**, **both explicitly consent**, the app **transcribes each person's own microphone live** using **Gnani Prisma v2.5 (STT)**, and when the call ends (or on tap of "Quick note") an LLM produces a **structured note** (summary, key points, decisions, action items, entities, uncertain spans, faithfulness flags) that is saved to the **Notes section** of the app on each phone.

It is an entry for the **Great Indian AI Internship Challenge** (deadline **Nov 10, 2026, 11:59 PM IST**; today is **Oct 28, 2026**). The brief is open, but the project **must use Gnani models/APIs** and be demoed publicly in a ≤60 s video. Awards we want to be eligible for: *Mixed Vibes* (code-mixed Hinglish etc.), *Real Deal* (useful real-world problem), *Noise Canceller* (noisy telephony audio), *Demo Day Drop* (60 s demo).

### 0.2 Non-negotiable principles
1. **Consent-first, no interception.** Capture starts only after **every participant** has tapped an explicit consent button on their own device. Either person can revoke at any time and capture stops immediately for everyone. There is **no hidden, silent, background, or third-party mode**. A persistent on-screen "● Transcribing" indicator is shown on both phones whenever capture is active.
2. **We do not tap the phone network.** The "call" is an app-to-app VoIP call (WebRTC via LiveKit). Never implement PSTN/SIP/dialer capture. Never claim PSTN support in UI, README, or demo text.
3. **No audio at rest.** Raw audio is never written to disk, a database, logs, or object storage in the product path. (The *eval harness* may write **synthetic** audio under `eval/` only.) Only text is stored, and only temporarily (see §13).
4. **Secrets stay server-side.** The Gnani key, LLM key, LiveKit secret never reach the browser or logs. The browser cannot set WebSocket headers anyway (Gnani needs headers), so the backend proxies.
5. **Synthetic/consenting data only.** No real customer calls, no real phone/Aadhaar/PAN numbers. Demo conversations are scripted or role-played by consenting teammates.
6. **Honest claims.** Report measured numbers only. Label vendor-reported numbers as vendor-reported. State limitations in README (see §17).
7. **Not legal advice.** The app is a consent-based prototype. Real commercial use would need a compliance review (DPDP Act 2023 / DPDP Rules 2025, sectoral rules). Say this in README.

### 0.3 How you (Claude Code) must work
- **Plan → build in small steps → test → commit.** One git commit per task with a clear message; one tag per phase (`phase-0-done`, …).
- **Maintain `PROGRESS.md`** after every task: what was done, decisions made, doc discrepancies found, what's next, open questions. The human may restart you in a fresh session because of usage limits; `PROGRESS.md` + this spec must be enough to resume without chat history.
- **Read docs before coding against an API.** Fetch the URLs in §2. Gnani docs pages are available as raw markdown by appending `.md` to the page path, and the full index is at `https://docs.gnani.ai/llms.txt`. If a fetch fails, **ask the human to paste the page** — do not guess parameters.
- **Batch your questions.** Ask the human at the four checkpoints in §1 (A–D), in one message each, not drip-by-drip. If the human is unavailable, use the stated default and mark it `ASSUMED` in `PROGRESS.md`.
- **Test as you go.** Every phase has acceptance criteria (§16). Do not start the next phase until the current one passes, or the human explicitly waives a criterion.
- **Keep it lean.** The deadline is ~13 days. Do not add features not in this spec. If a task threatens the schedule, cut from the "Cut list" in §16.9 first.
- **Conventions.** Python 3.11+, fully type-hinted, `ruff` + `mypy --strict` on core modules; TypeScript `strict: true`, ESLint + Prettier; small modules; docstrings on public functions; structured JSON logging with **no transcripts or secrets in INFO logs** (transcripts only at DEBUG and only when `LOG_TRANSCRIPTS=true`).
- **Placeholders.** `⟦ASK-USER: …⟧` means you must obtain a value from the human before proceeding. `⟦VERIFY: …⟧` means check the linked doc and record the finding. `⟦DOC: url⟧` is a doc to read.

---

## 1. Inputs to collect from the human (ask at the checkpoint)

**Checkpoint A — before any code (Phase 0 start)**
1. ⟦ASK-USER: `GNANI_API_KEY`⟧ (created at https://app.gnani.ai/voice — up to 3 free keys). Also: **how many concurrent STT WebSocket connections may one key hold?** (We need 2 per room.) If unknown, we measure in Phase 0.
2. ⟦ASK-USER: How are the 5,000 programme credits consumed (per audio second? per request?) and does **silence sent over the WebSocket** count?⟧ Default assumption: audio seconds sent are billed, so we do not stream silence while muted.
3. ⟦ASK-USER: LLM provider for summaries⟧ Options: (a) Anthropic Claude API — needs `ANTHROPIC_API_KEY` (billed separately from any Claude Pro subscription); (b) any OpenAI-compatible endpoint (key + base URL + model); (c) local **Evon v3.3** via an OpenAI-compatible server (needs a GPU; weights by request at https://huggingface.co/gnani/gnani-evon-v3.3-30B-A3B). **Default: (a) if a key exists, else (b).** Note: Evon is *not* on the Gnani API platform, so the project's Gnani-model usage is STT (and optional TTS).
4. ⟦ASK-USER: The two demo languages⟧ (e.g. `en-IN` + `hi-IN`, or `kn-IN`, `ta-IN`…) and **the demo scenario** (default: *Hinglish kirana phone order* and *appointment booking*). Supported STT codes: `bn-IN en-IN gu-IN hi-IN kn-IN ml-IN mr-IN pa-IN ta-IN te-IN`.
5. ⟦ASK-USER: Team size (1 or 2) and each member's GitHub/LinkedIn handle⟧ for README contribution table.

**Checkpoint B — before Phase 3 (call audio)**
6. ⟦ASK-USER: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`⟧ from LiveKit Cloud (https://cloud.livekit.io, free tier — ⟦VERIFY: current free-tier limits⟧). Alternative: self-hosted `livekit-server --dev` via docker (then a public HTTPS tunnel is needed for phones). Default: LiveKit Cloud.
7. ⟦ASK-USER: How will the two phones reach the dev server over HTTPS?⟧ (mic access in mobile browsers requires HTTPS). Default: `cloudflared tunnel --url http://localhost:8000` during dev; Render/Fly/Railway for the final demo.

**Checkpoint C — before Phase 6 (evaluation)**
8. ⟦ASK-USER: Noise audio sources⟧ — URLs or files of *freely licensed* noise (e.g. a street, cafeteria babble, market). Default: synthesize pink/white/babble noise ourselves (no licensing issues). 
9. ⟦ASK-USER: 10+ short **real** recorded clips from consenting teammates⟧ (≥ 10 s each) to complement TTS-generated test audio. Default: skip real clips and state this limitation loudly in the report.
10. ⟦ASK-USER: Eval audio budget⟧ (max total audio seconds to spend from the credits). Default: 20 minutes total.

**Checkpoint D — before Phase 7 (ship)**
11. ⟦ASK-USER: Deployment target⟧ (default: Render/Fly/Railway single container) and domain/URL.
12. ⟦ASK-USER: Public repo URL, LinkedIn/X handles, preferred app name/logo⟧.

---

## 2. Documentation index (read before coding the relevant part)

### 2.1 Gnani (primary)
| Topic | URL |
|---|---|
| Full doc index (machine-readable) | https://docs.gnani.ai/llms.txt |
| Intro | https://docs.gnani.ai/api/introduction/introduction.md |
| Quick start | https://docs.gnani.ai/api/introduction/quick-start.md |
| **STT realtime WebSocket (core)** | https://docs.gnani.ai/api/STT/stt-websocket.md |
| STT REST (≤60 s clips; used by eval) | https://docs.gnani.ai/api/STT/speech-to-text.md |
| STT batch (long files) | https://docs.gnani.ai/api/STTBatch/Introduction.md |
| TTS REST | https://docs.gnani.ai/api/TTS/tts-inference.md |
| TTS streaming (SSE) | https://docs.gnani.ai/api/TTS/tts-sse.md |
| TTS realtime WebSocket | https://docs.gnani.ai/api/TTS/tts-websocket.md |
| Available voices (Timbre v2.5 / v3.0) | https://docs.gnani.ai/api/TTS/available-voices.md |
| TTS audio tags (Timbre v3.0) | https://docs.gnani.ai/api/TTS/tts-audio-tags.md |
| TTS text normalization | https://docs.gnani.ai/api/TTS/tts-input-formating.md |
| Python SDK (note: no VAD tuning in SDK) | https://docs.gnani.ai/python-sdk/introduction.md |
| Use case: call analytics with LLM | https://docs.gnani.ai/api/use-cases/call-analytics.md |
| Use case: real-time compliance monitoring | https://docs.gnani.ai/api/use-cases/real-time-compliance.md |
| AsyncAPI spec for STT WS | https://docs.gnani.ai/stt-websocket.yml |
| AsyncAPI spec for TTS WS | https://docs.gnani.ai/tts-websocket.yml |
| OpenAPI specs | https://docs.gnani.ai/STT.yml , /TTS.yml , /STTBatch.yml |
| Reference WS client implementations | https://pypi.org/project/livekit-plugins-gnani/ , https://github.com/Gnani-AI-Mintlify/pipecat-gnani |
| Dashboard / keys | https://app.gnani.ai/voice |
| Support | Discord https://discord.gg/aECcvtABpq |
| Contest page | https://www.gnani.ai/internship |

### 2.2 Everything else
| Topic | URL |
|---|---|
| LiveKit docs (client SDK, tokens, Python server SDK) | https://docs.livekit.io ⟦VERIFY: current JS `livekit-client` and Python `livekit-api` usage⟧ |
| Anthropic API overview / models / tool use | https://docs.claude.com/en/api/overview ⟦VERIFY: current model IDs and tool-use/forced-tool-choice syntax⟧ |
| FastAPI WebSockets | https://fastapi.tiangolo.com/advanced/websockets/ |
| `websockets` library (client; `additional_headers` on ≥13, `extra_headers` on older) | https://websockets.readthedocs.io |
| AudioWorklet | https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet |
| Screen Wake Lock | https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API |
| MediaTrackConstraints (echoCancellation etc.) | https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints |
| vite-plugin-pwa | https://vite-pwa-org.netlify.app |
| Playwright (fake media devices) | https://playwright.dev |
| jiwer (WER/CER) | https://github.com/jitsi/jiwer |
| DPDP Act / Rules (consent, notice) — for README limitations section | ⟦ASK-USER: preferred official source URL (MeitY)⟧ |

> **Rule:** if a doc contradicts this spec (e.g. a header name, a message field, a limit), follow the doc and log it in `PROGRESS.md` under "Doc discrepancies".

---

## 3. Product specification

### 3.1 Personas and the core scenario
- **Host** (e.g., a shopkeeper's assistant, a freelancer) creates a room, picks their speaking language, shares a link/code.
- **Guest** opens the link on another phone, picks their speaking language, joins.
- Both read and accept the **consent notice**; the call connects; live captions appear on both phones, attributed per speaker; either can tap **Quick note**; the host (or either) taps **End**; both phones receive the final note into **Notes**.
- Each participant may speak a **different language** (the STT `lang_code` is per connection). `en-IN` accepts English–Hindi mixed audio and outputs Latin script (per Gnani docs).

### 3.2 Functional requirements (must)
| ID | Requirement |
|---|---|
| F1 | Create/join a 2-person room by 6-character code or link. Max 2 participants; 3rd gets a clear "room full" error. |
| F2 | Per-device explicit consent with versioned notice text; consent log; revoke anytime. Capture only when **both** have consented **and** host pressed *Start*. |
| F3 | Live app-to-app voice call (LiveKit WebRTC, audio only) with mute, end. |
| F4 | Each device captures **its own microphone**, downsamples to 16 kHz mono PCM s16le, sends 1,024-byte frames in real time to backend; backend proxies to Gnani `wss://api.vachana.ai/stt/v3/stream` with correct headers. |
| F5 | Live captions on both phones, speaker-labelled, ordered, with "…speaking" indicator, per-utterance latency badge. |
| F6 | **Quick note** (anytime during capture) and **Final note** (on End) generated by the LLM into a strict JSON schema (§12.2), validated, with one retry. |
| F7 | **Faithfulness check**: every number/date/amount/proper noun in the note must appear in the transcript (normalized); otherwise flagged ⚠ in UI. Every key point cites transcript segment sequence numbers as evidence. |
| F8 | **Notes section** (local-first, IndexedDB): list, search, open, edit title, delete, export (Markdown/copy/share sheet). Works offline after saving. |
| F9 | Optional **bias words** (up to 100 single words, letters only) entered by user (names, brands) → Gnani word boosting (`x-bias-list` + `x-bias-score`). |
| F10 | **Privacy controls**: "Delete this conversation from the server now", server retention default 24 h, "Demo mode" banner. |
| F11 | **Debug drawer** (toggle): per-stage latency (mic→server jitter, Gnani `latency`, end-of-speech→caption), segment counts, audio seconds used, upstream reconnects. |
| F12 | **Solo test mode** (one device, no call): tests STT + notes without a second person. Still requires self-consent. |

### 3.3 Should (if time)
- S1: **Read note aloud** with Gnani Timbre TTS (⟦DOC: TTS REST/SSE pages⟧) — button on note detail.
- S2: Output-language toggle for the note (English / same-as-conversation / Hindi).
- S3: Local Evon provider adapter (OpenAI-compatible).
- S4: Live rolling note every 60 s (off by default).

### 3.4 Explicitly out of scope (do not build)
PSTN/SIP/real phone numbers; recording or storing audio; accounts/login/payments; push notifications; native iOS/Android apps; more than 2 participants; diarization of mixed audio; emotion detection claims (Gnani's production STT API does not document emotion output; do not fake it); admin dashboards.

### 3.5 Screens (mobile-first, 360–430 px wide; also usable on desktop)
1. **Home**: *Start a conversation* · *Join with code* · *Notes* · small *Privacy* link. Shows Demo-mode banner if enabled.
2. **Setup** (create or join): display name; "I speak in" (language dropdown, default `en-IN`); "Notes in" (English/Same/Hindi); optional bias words chips; consent for *this device's microphone* happens later.
3. **Lobby + Consent**: room code + share link + QR (optional); list of participants with live consent status (✔ / waiting); the full consent notice (§13.2) with *I agree* and *I don't agree*; host sees *Start* enabled only when both ✔.
4. **Call**: top bar (room code, ● Transcribing indicator, timer, debug toggle); live captions list (own = right/accent, other = left/neutral; `aria-live="polite"`); bottom controls: Mute, **Quick note**, **Revoke consent / Stop**, **End call**. Connection quality chip.
5. **Note viewer**: tabs *Note* / *Transcript*; badges ⚠ for flagged items; evidence chips that scroll to transcript lines; actions: edit title, copy, export `.md`, share, delete; optional *Read aloud*.
6. **Notes list**: reverse-chronological cards (title, date, participants, languages, ⚠ count), search box, swipe/long-press delete.
7. **Privacy / Settings**: what is stored where, retention, *Delete everything on this device*, *Delete server data for my last room*, app version, links to README limitations.

**Design direction:** calm, legible, high-contrast; one accent colour; system font stack plus one Indic-capable fallback (Noto Sans family via system fallback, no external font CDN needed); light/dark via CSS variables and `prefers-color-scheme`; safe-area insets (`env(safe-area-inset-*)`), `100dvh`, ≥44 px tap targets; no motion except a subtle pulse on the recording dot (respect `prefers-reduced-motion`). Captions must render Devanagari/Tamil/Kannada etc. correctly (test with real strings).

---

## 4. System architecture

### 4.1 Component diagram
```
 Phone A (PWA)                                           Phone B (PWA)
 ┌───────────────────────────┐                           ┌───────────────────────────┐
 │ UI (React)                │                           │ UI (React)                │
 │ ├─ LiveKit client  ◄──────┼──── WebRTC call audio ───►┼──────► LiveKit client     │
 │ ├─ Mic → AudioWorklet     │     (via LiveKit Cloud)   │        Mic → AudioWorklet │
 │ │   16 kHz s16le, 1024 B  │                           │        16 kHz s16le       │
 │ ├─ WS /ws/stt  (own mic)  │                           │        WS /ws/stt         │
 │ ├─ WS /ws/room (events)   │                           │        WS /ws/room        │
 │ └─ IndexedDB (notes)      │                           │        IndexedDB          │
 └──────────┬────────────────┘                           └────────────┬──────────────┘
            │ HTTPS/WSS                                               │ HTTPS/WSS
            ▼                                                         ▼
 ┌────────────────────────────────────────────────────────────────────────────────────┐
 │ Saar backend (FastAPI, single process)                                             │
 │  REST /api/*   ·  WS /ws/stt/{room}  ·  WS /ws/room/{room}                         │
 │  ┌──────────┐ ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌────────────────┐  │
 │  │ Rooms &  │ │ STT Proxy   │ │ Room Hub     │ │ Summarizer  │ │ Retention job  │  │
 │  │ Consent  │ │ (per user)  │ │ (pub/sub +   │ │ + Faithful- │ │ (purge ≥ TTL)  │  │
 │  │ state    │ │ pacer,      │ │ reorder buf) │ │ ness check  │ │                │  │
 │  │ machine  │ │ rotation    │ └──────┬───────┘ └──────┬──────┘ └────────────────┘  │
 │  └────┬─────┘ └──────┬──────┘        │                │                            │
 │       │              │               ▼                │                            │
 │       ▼              │         SQLite (text only)     │                            │
 │   LiveKit token      │                                ▼                            │
 │   (livekit-api)      ▼                          LLM provider (Anthropic /          │
 │                 Gnani Prisma STT                 OpenAI-compat / local Evon)       │
 │                 wss://api.vachana.ai/stt/v3/stream                                 │
 └────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Key design decisions (and why)
1. **Each phone transcribes only its own mic.** This gives perfect speaker separation for free (no diarization), avoids network-degraded call audio in the ASR path, and makes consent unambiguous: each person streams only *their own* voice. Trade-off: echo when on loudspeaker → mitigated by `echoCancellation`, headphone advice in UI, and a server-side echo-dedupe heuristic (§11.4).
2. **Call audio and ASR audio are separate paths.** LiveKit carries the call; our own WebSocket carries 16 kHz PCM to the backend. A LiveKit outage does not break captions, and vice-versa. A `CALL_AUDIO_PROVIDER=none` mode exists for tests.
3. **Backend proxies Gnani.** Browsers cannot set the custom WS upgrade headers Gnani requires (`x-api-key-id`, `lang_code`, …), and the key must stay secret.
4. **Client downsamples to 16 kHz and sends exact 1,024-byte frames** (512 samples = 32 ms) at real-time cadence, per the Gnani spec; avoids reliance on server-side resampling cadence for 44.1/48 kHz.
5. **Local-first notes.** Server keeps transcripts/notes for a short TTL only; the durable copy lives on each device (IndexedDB). Strong privacy story, offline Notes.
6. **Single-process backend** with in-memory hub: simplest correct thing for a 2-person demo. Document that scaling out needs Redis pub/sub (not built).
7. **LLM provider abstraction** so summarization isn't locked to one vendor and a Gnani Evon adapter can be dropped in.

### 4.3 End-to-end sequence (happy path)
1. A: `POST /api/rooms` → `{room_code, participant_id, token, livekit_url, livekit_token, notice}`.
2. B: opens link → `POST /api/rooms/{code}/join` → same shape.
3. Both connect `WS /ws/room/{code}?token=…`; receive `room_state`.
4. Both read notice → `POST /api/rooms/{code}/consent {action:"grant", notice_version}` → hub broadcasts `consent_changed`.
5. Host → `POST /api/rooms/{code}/start` (server checks both consents) → room `active`; broadcast `capture_state{active:true}`.
6. Each client: connect LiveKit (call), enable mic, build AudioWorklet from the *published local mic track*, open `WS /ws/stt/{code}?token=…`, send `{"type":"start",…}`.
7. Server STT proxy opens upstream Gnani WS with headers; waits for `connected`; sends `ready` to the client; client streams frames.
8. Upstream emits `processing` then `transcript`; proxy persists a `segment`, forwards to own client, and publishes to hub; hub reorders and broadcasts `segment` events to **both** clients.
9. Quick note: `POST /api/rooms/{code}/notes/quick` → LLM → `note_ready` event (note JSON included) → clients save to IndexedDB.
10. End: `POST /api/rooms/{code}/end` → proxies close, final note generated → `note_ready` → saved; room `ended`; server data purged after TTL.

---

## 5. Technology stack (pin versions in lockfiles; ⟦VERIFY⟧ current stable versions)

**Backend:** Python ≥3.11; `fastapi`, `uvicorn[standard]`, `websockets` (client to Gnani), `pydantic` v2, `sqlmodel` (or SQLAlchemy 2 + `aiosqlite`), `pyjwt`, `livekit-api`, `anthropic`, `httpx`, `python-dotenv`/`pydantic-settings`, `tenacity` (retries), `structlog` (or stdlib JSON logging). Dev: `pytest`, `pytest-asyncio`, `ruff`, `mypy`. Eval extras: `numpy`, `scipy`, `soundfile`, `jiwer`, `pandas`, `matplotlib`, `pyyaml`, `rapidfuzz`.
**Frontend:** React 18 + TypeScript + Vite; Tailwind CSS; `react-router`; `livekit-client`; `idb-keyval` (IndexedDB); `vite-plugin-pwa`; Vitest + Testing Library; Playwright. State: React context + `zustand` (small).
**Packaging:** Docker (multi-stage: build frontend → copy `dist` into backend image; FastAPI serves static files at `/`). One origin, one URL.
**Tooling:** `uv` (preferred) or `pip`+venv; `pnpm` or `npm`; `pre-commit` (ruff, prettier).

---

## 6. Repository layout (create exactly this)

```
saar/
├─ SPEC.md                      # this file (also copied to CLAUDE.md)
├─ PROGRESS.md                  # running log (you maintain)
├─ README.md                    # contest-ready README (§17)
├─ .env.example
├─ docker-compose.yml           # app (+ optional local livekit dev server profile)
├─ Dockerfile
├─ backend/
│  ├─ pyproject.toml
│  ├─ app/
│  │  ├─ main.py                # FastAPI app, static mount, lifespan (retention task)
│  │  ├─ config.py              # pydantic-settings; all env vars (§18)
│  │  ├─ logging.py             # JSON logs, redaction filter
│  │  ├─ models.py              # SQLModel tables (§10)
│  │  ├─ db.py                  # engine/session
│  │  ├─ security.py            # JWT issue/verify, room-code generator, rate limiter
│  │  ├─ schemas.py             # pydantic request/response + WS message models (§9)
│  │  ├─ api/
│  │  │  ├─ rooms.py            # create/join/state/consent/start/end/delete
│  │  │  ├─ notes.py            # quick/final note endpoints
│  │  │  └─ health.py           # /api/health, /api/config
│  │  ├─ ws/
│  │  │  ├─ stt_proxy.py        # /ws/stt/{room}  (client ↔ Gnani)
│  │  │  └─ room_hub.py         # /ws/room/{room} (events, reorder buffer, echo dedupe)
│  │  ├─ gnani/
│  │  │  ├─ stt_client.py       # upstream WS client, header builder, pacer, rotation
│  │  │  ├─ tts_client.py       # (S1) REST/SSE helpers
│  │  │  └─ errors.py
│  │  ├─ call_audio/
│  │  │  ├─ base.py             # CallAudioProvider interface
│  │  │  ├─ livekit_provider.py # token minting
│  │  │  └─ none_provider.py    # tests
│  │  ├─ summarizer/
│  │  │  ├─ providers/{base,anthropic_provider,openai_compat,mock}.py
│  │  │  ├─ prompts.py          # system + user prompt templates (§12)
│  │  │  ├─ schema.py           # Note pydantic model + JSON schema
│  │  │  ├─ service.py          # orchestrates, validation, retry, faithfulness
│  │  │  └─ faithfulness.py     # §12.4
│  │  └─ retention.py           # purge job
│  ├─ tests/                    # unit + integration (fake Gnani server)
│  └─ scripts/
│     ├─ smoke_stt_rest.py  smoke_stt_ws.py  smoke_tts.py  smoke_llm.py
│     └─ fake_gnani_server.py   # protocol-faithful fake for tests/dev
├─ frontend/
│  ├─ package.json  vite.config.ts  tailwind.config.ts  index.html
│  ├─ public/{manifest.webmanifest, icons/}
│  └─ src/
│     ├─ main.tsx  App.tsx  routes.tsx
│     ├─ lib/{api.ts, ws.ts, store.ts, i18n.ts, notesDb.ts, wakeLock.ts, languages.ts}
│     ├─ audio/{capture.ts, pcm-worklet.ts, levelMeter.ts}
│     ├─ call/{livekit.ts}
│     ├─ components/ …           # Captions, ConsentCard, RecordingDot, NoteView, etc.
│     └─ pages/{Home,Setup,Lobby,Call,Notes,NoteDetail,Privacy}.tsx
├─ eval/
│  ├─ README.md
│  ├─ dialogues/*.yaml          # scripted dialogues with gold facts
│  ├─ noise/                    # synthesized or user-provided noise
│  ├─ run_eval.py  make_audio.py  degrade.py  metrics.py  charts.py
│  └─ results/                  # results.csv, charts/*.png, report.md
├─ e2e/                          # Playwright tests (fake media devices)
└─ docs/
   ├─ ARCHITECTURE.md  CONSENT_AND_PRIVACY.md  DEMO_SCRIPT.md  LIMITATIONS.md
```

---

## 7. Gnani integration (facts taken from the docs on Oct 28, 2026 — re-verify in Phase 0)

### 7.1 STT realtime WebSocket — the core contract
- **Endpoint:** `wss://api.vachana.ai/stt/v3/stream`
- **All config is passed as WebSocket upgrade headers** (fixed for the connection, except substitution + bias headers which can be updated via `update_settings`).

| Header | Our value |
|---|---|
| `x-api-key-id` | `GNANI_API_KEY` (server env) |
| `lang_code` | participant's chosen code (e.g. `hi-IN`, `en-IN`) |
| `x-sample-rate` | `16000` (we always send 16 kHz) |
| `x-format` | `transcribe` (enables ITN: ₹, lakh/crore grouping, dates, times, phone numbers) by default; **`verbatim` if bias words are set** (boosting wants spoken-form tokens) |
| `itn_native_numerals` | `false` default |
| `x-vad-threshold` | `0.5` (clean web mic) — env-tunable |
| `x-min-silence-ms` | `700` (natural conversation 600–900) — env-tunable |
| `x-min-speech-ms` | `100` (raise to 200 if noisy) |
| `x-min-segment-ms` | `120` (warning: raising too far silently drops short answers like "yes"/"haan") |
| `x-max-speech-s` | unset (set `30` to force results on monologues) |
| `x-bias-list` / `x-bias-score` | JSON array ≤100 single letters-only words, and score ∈ {0.0, 0.5, 1.0, 1.5, 2.0}; **Indic words as `\uXXXX`-escaped JSON** so headers stay ASCII |

- **Audio format:** raw **PCM s16le, mono, binary frames of exactly 1,024 bytes** (512 samples). At 16 kHz that is one frame every **32 ms**. **Send at real-time cadence; never buffer-and-burst** (degrades VAD).
- **Server → client JSON messages:** `connected` (echoes `config.sample_rate`, `chunk_size`), `processing` (VAD end-of-speech detected), `transcript` (`text`, `audio_duration_ms`, `segment_id`, `segment_index`, `latency`, `timestamp`), `error` (`message`), `settings_updated`.
- **Client → server control (text JSON):** `{"type":"update_settings","substitution":{…},"bias":{"list":[…],"score":1.5}}`.
- **Session cap:** **15 minutes** per connection → we must **rotate** connections (§8.3).
- **Transcripts are per VAD segment (utterance)**, not word-by-word. Captions therefore appear after the speaker pauses (`min_silence` + `latency` ≈ 0.7 s + ~0.3 s). ⟦VERIFY: the doc mentions an `x-partials` header producing `partial_transcript` messages in the word-boosting section but it is **not** in the header table. Check `https://docs.gnani.ai/stt-websocket.yml`. If supported, enable it for live typing-style captions behind `STT_PARTIALS=true`; otherwise use the "…speaking" indicator only.⟧
- Python SDK `gnani-vachana` does **not** expose VAD tuning → **use a raw `websockets` client**.
- Browser WebSocket cannot set headers → **backend proxy** (already our design).

### 7.2 Other Gnani endpoints we touch
- **STT REST** (≤60 s clips; used by the eval harness and smoke test): ⟦DOC: speech-to-text.md⟧ — multipart `audio_file` + `language_code`, key in `x-api-key-id` ⟦VERIFY exact header/field names⟧. Response contains `transcript`.
- **TTS** (optional S1 + eval audio generation): base `https://api.vachana.ai`; REST `POST /api/v1/tts/inference`, SSE `POST /api/v1/tts/sse`, WS `wss://api.vachana.ai/api/v1/tts`; auth header `X-API-Key-ID`; voices seen in docs/plugin: `Karan, Simran, Nara, Riya, Viraj, Raju` (and `sia` in an SSE example) ⟦VERIFY: current voice catalogue for Timbre v2.5 vs v3.0 in available-voices.md; model/voice parameter names; output sample rate/format⟧.
- **Do not use** Gnani Agent Builder / Platform API — out of scope for this contest ("API platform only").

### 7.3 Credits and limits
- 5,000 programme credits. ⟦ASK-USER: conversion⟧. Implement a **usage meter** (audio seconds forwarded upstream per participant/room, persisted in `usage`) and a hard guard `MAX_STT_SECONDS_PER_ROOM` (default 1800) that stops capture with a clear UI message when exceeded.
- Phase 0 measures: (a) can one key open 2 concurrent STT sockets? (b) idle-socket timeout when no frames are sent? (c) does muted-silence count as billable audio?

---

## 8. Backend design

### 8.1 Rooms and consent state machine
```
LOBBY ──(both consent GRANTED && host /start)──► ACTIVE ──(/end | host leaves | budget exceeded)──► ENDED
  ▲                                                │
  └──────────(any REVOKE)──────────────────────────┘  → capture stops for everyone; room returns to LOBBY (or ENDED if host chooses End)
```
- Participant consent states: `none | granted | revoked`. Capture allowed ⇔ `status==ACTIVE` ∧ all participants `granted`.
- Any `revoke` → immediately: close both STT proxies, broadcast `capture_state{active:false, reason:"consent_revoked", by:participant_id}`, status → `LOBBY`. Transcript so far is kept until TTL unless someone calls delete.
- Idempotent endpoints; all transitions validated server-side (never trust the client).
- Room codes: 6 chars from an unambiguous alphabet (no `0/O/1/I`), cryptographically random; expire 2 h after creation if never started.
- Participant token = JWT HS256 (`room_id`, `participant_id`, `role`, exp = 3 h). WS auth via `?token=` (document the log-redaction of query strings) or first message; prefer first-message auth to avoid tokens in logs.

### 8.2 STT proxy (`ws/stt_proxy.py` + `gnani/stt_client.py`)
Per participant connection:
1. Accept client WS; require first text frame `{"type":"start","sample_rate":16000,"client_ts":<ms>}`; validate token, room `ACTIVE`, participant consent `granted`, budget available.
2. Build upstream headers from the participant's settings (§7.1). Connect with `websockets.connect(url, additional_headers=headers, max_size=…, ping_interval=20)`. Wait for `connected` (timeout 5 s). Send client `{"type":"ready"}`.
3. **Ingest loop**: client binary frames → validate `len==1024` (drop/log otherwise) → push to an `asyncio.Queue` (maxsize ≈ 3 s of frames = ~94).
4. **Pacer loop**: send exactly one frame per 32 ms using `time.monotonic()` scheduling. If queue depth > 10 frames (≈320 ms backlog after network jitter) allow catch-up at ≤1.25× rate until ≤3 frames; if queue overflows, drop *oldest* frames and increment a `dropped_frames` counter shown in the debug drawer. Never send faster than 1.25×.
5. **Upstream reader**: parse JSON; on `processing` → notify client + hub (`processing{participant_id}`); on `transcript` → persist `Segment`, update usage, forward to client (`transcript`) and hub; on `error` → forward and log (no payload secrets).
6. **Mute/idle**: when the client sends `{"type":"pause"}` stop forwarding (no silence frames; keep socket idle with pings). On `{"type":"resume"}` continue. If upstream closes while paused, reconnect lazily on resume. ⟦VERIFY idle timeout in Phase 0⟧.
7. **Stop**: on client `stop`, consent revoke, room end, or budget exceed → close upstream cleanly, send `stopped{reason}`.

### 8.3 Session rotation (15-minute cap) and reconnects
- Track `upstream_age`. At ≥ 13:00, rotate at the next idle moment (no `processing` pending and ≥ 1.5 s since last audio-with-speech); hard-rotate at 14:45.
- Rotation: open **new** upstream first; once `connected`, atomically switch the pacer's target; keep queued frames; close the old upstream after its pending transcript arrives (max 3 s). Segment indexes restart per upstream — we assign our own `local_index` per participant.
- Unexpected close/error: exponential backoff (0.5 s, 1 s, 2 s; 3 tries). Client sees `upstream_status{state:"reconnecting"|"connected"|"failed"}`. After failure, capture continues to be *blocked* with a visible error (never silently "pretend" to transcribe).

### 8.4 Room hub and ordering (`ws/room_hub.py`)
- In-memory `rooms[code]` → set of subscribed sockets + reorder buffer.
- **Estimated segment times:** `ended_at ≈ server_receive_time − latency_ms`; `started_at = ended_at − audio_duration_ms`. All times are server-clock, so the two participants are comparable.
- **Reorder buffer:** hold each segment 1,500 ms, sort by `started_at`, then flush in order assigning a monotonically increasing `seq`. Clients display their *own* transcript immediately as `provisional=true` and reconcile when the authoritative `segment` (same `upstream_segment_id`) arrives.
- **Echo dedupe heuristic:** if a segment from participant X overlaps (±600 ms) a segment from participant Y and the normalized token-set similarity ≥ 0.85, mark the *lower-energy* source (client sends rough RMS in `start`/periodic `level` messages) or, if unknown, the *later* one as `possible_echo=true` and hide it by default (visible in debug drawer). Env `ECHO_DEDUPE=true`. UI tells users to use headphones.
- Broadcast events (see §9.3). Heartbeat ping every 15 s; drop dead sockets.

### 8.5 Call audio provider (`call_audio/`)
- Interface: `create_credentials(room_code, participant) -> {url, token}`.
- `LiveKitProvider`: mint a JWT with `livekit-api` (`AccessToken(api_key, api_secret).with_identity(participant_id).with_name(display_name).with_grants(VideoGrants(room_join=True, room=room_code, can_publish=True, can_subscribe=True))`) ⟦VERIFY exact API in livekit docs⟧. TTL 3 h. Audio only.
- `NoneProvider`: returns `{url:null, token:null}`; frontend skips the call (used in e2e and Solo mode).

### 8.6 Persistence and retention
SQLite (file under `/data/saar.db`, ephemeral OK). Text only. A background task (every 10 min) deletes rooms, segments, notes, consents older than `SERVER_RETENTION_HOURS` (default 24) and any room `ENDED` more than that. `DELETE /api/rooms/{code}/data` purges immediately and broadcasts `data_deleted`. Consent log rows are kept **without** transcript content for the same TTL (then deleted) — they contain participant id, timestamp, notice hash only.

### 8.7 Security hygiene
Rate-limit room creation/join (per IP, in-memory token bucket); CORS restricted to own origin; security headers (CSP allowing `wss:` to own origin and LiveKit URL, `Permissions-Policy: microphone=(self)`); input validation via pydantic; max WS message sizes; no stack traces to clients; log redaction filter for `x-api-key-id`, JWTs, and transcript text.

---

## 9. Protocols and schemas (authoritative; implement with pydantic models in `schemas.py` and mirror in TS types)

### 9.1 REST
| Method & path | Auth | Body → Response |
|---|---|---|
| `GET /api/health` | – | `{status:"ok", version}` |
| `GET /api/config` | – | `{demo_mode, languages:[{code,label,native}], max_stt_seconds, call_audio_provider, stt_partials, notice:{version,text_en,text_hi,sha256}}` |
| `POST /api/rooms` | – | `{display_name, lang_code, notes_lang:"en"\|"same"\|"hi", bias_words?:string[], solo?:boolean}` → `{room_code, participant_id, token, role:"host", call:{url,token}\|null, notice}` |
| `POST /api/rooms/{code}/join` | – | `{display_name, lang_code, notes_lang, bias_words?}` → same shape, `role:"guest"`; `409 room_full`, `404 room_not_found`, `410 room_expired` |
| `GET /api/rooms/{code}` | JWT | `{status, participants:[{id,name,role,lang_code,consent}], all_consented, started_at?}` |
| `POST /api/rooms/{code}/consent` | JWT | `{action:"grant"\|"revoke", notice_version}` → `{consent}`; rejects stale `notice_version` |
| `POST /api/rooms/{code}/start` | JWT(host) | `{}` → `{status:"active"}`; `409 not_all_consented` |
| `POST /api/rooms/{code}/end` | JWT | `{}` → `{status:"ended", final_note_id}` (note arrives async) |
| `POST /api/rooms/{code}/notes/quick` | JWT | `{}` → `{note_id, status:"pending"}` (min 3 segments else `422 too_little_content`) |
| `GET /api/rooms/{code}/notes` | JWT | `[ {id, kind, status, created_at} ]` |
| `GET /api/notes/{id}` | JWT | full note JSON (§12.2) + `transcript` array |
| `DELETE /api/rooms/{code}/data` | JWT | `{deleted:true}` |

Errors: `{error:{code, message}}` with stable machine codes.

### 9.2 `WS /ws/stt/{code}` (client ↔ our backend)
Client→server:
- text: `{"type":"auth","token":"…"}` (first), then `{"type":"start","sample_rate":16000,"client_ts":123}`; `{"type":"pause"}`; `{"type":"resume"}`; `{"type":"stop"}`; `{"type":"level","rms":0.07}` (every 500 ms, optional).
- binary: PCM s16le frames, **1024 bytes**.

Server→client (text JSON): `{"type":"ready"}`, `{"type":"upstream_status","state":"connecting|connected|reconnecting|failed","detail"?:"…"}`, `{"type":"processing"}`, `{"type":"transcript","text","upstream_segment_id","local_index","audio_duration_ms","latency_ms"}`, `{"type":"error","code","message"}`, `{"type":"stopped","reason":"client|consent_revoked|room_ended|budget|error"}`.

### 9.3 `WS /ws/room/{code}` (events to all participants)
Client→server: `{"type":"auth","token"}`, `{"type":"ping"}`.
Server→client: `room_state{status,participants,all_consented}`, `consent_changed{participant_id,consent}`, `capture_state{active,reason?,by?}`, `processing{participant_id}`, `segment{seq,participant_id,name,text,lang_code,started_at,ended_at,upstream_segment_id,possible_echo}`, `note_status{note_id,status}`, `note_ready{note}`, `usage{stt_seconds_used,stt_seconds_limit}`, `data_deleted{}`, `error{code,message}`, `pong`.

---

## 10. Data model (SQLModel; text only)

| Table | Columns |
|---|---|
| `rooms` | `id` (uuid), `code` (unique), `status` (`lobby/active/ended`), `created_at`, `started_at`, `ended_at`, `host_participant_id`, `notice_version`, `demo_mode` (bool) |
| `participants` | `id`, `room_id`, `display_name`, `role`, `lang_code`, `notes_lang`, `bias_words_json`, `consent` (`none/granted/revoked`), `joined_at`, `left_at` |
| `consents` | `id`, `room_id`, `participant_id`, `action`, `notice_version`, `notice_sha256`, `at` (no IP stored) |
| `segments` | `id`, `room_id`, `participant_id`, `upstream_segment_id`, `local_index`, `seq` (nullable until flushed), `text`, `started_at`, `ended_at`, `audio_ms`, `latency_ms`, `possible_echo` |
| `notes` | `id`, `room_id`, `kind` (`quick/final`), `status` (`pending/ready/failed`), `created_at`, `model`, `prompt_version`, `note_json`, `faithfulness_json`, `error` |
| `usage` | `id`, `room_id`, `participant_id`, `stt_audio_seconds`, `stt_segments`, `llm_input_tokens`, `llm_output_tokens`, `reconnects`, `dropped_frames` |

---

## 11. Frontend design

### 11.1 Audio capture pipeline (`audio/capture.ts`, `audio/pcm-worklet.ts`)
1. User gesture (tapping *Start/Join call*) → create `AudioContext` (default sample rate) and `resume()` it (iOS Safari requires a gesture).
2. Get mic: prefer the **published LiveKit local mic track** (`room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack`) so the call and ASR use one capture; in Solo mode call `getUserMedia({audio:{channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true}})`. Constraints come from config (`MIC_NS`, `MIC_AEC`, `MIC_AGC`) so the eval can test their effect.
3. `MediaStreamAudioSourceNode` → `AudioWorkletNode('pcm16k')`.
4. **Worklet algorithm:** accumulate Float32 at `inputRate` (usually 48,000 or 44,100). Resample to 16,000 Hz with an **anti-aliased** method: for integer ratios (48k→16k = 3) average N samples (box filter) or use a short FIR low-pass then decimate; for non-integer ratios (44.1k) use linear interpolation after a low-pass (document the choice; unit-test with a 1 kHz sine and a 7 kHz sine to confirm aliasing is suppressed). Convert to Int16 (clamp [-1,1], `round(x*32767)`), fill a 512-sample buffer, and `postMessage` an `ArrayBuffer(1024)` each time it is full. Also post an RMS level every 500 ms.
5. Main thread sends each ArrayBuffer over `/ws/stt` immediately (the worklet already produces frames in real time → natural pacing). If `ws.bufferedAmount > 64 KB`, log and drop oldest (never block the audio thread).
6. Lifecycle: stop on revoke/end/unmount; close `AudioContext`; release wake lock.

### 11.2 Mobile realities to handle
- **HTTPS required** for mic. Detect insecure context and show a clear message.
- **Wake Lock:** request `navigator.wakeLock.request('screen')` during a call; re-acquire on `visibilitychange`. Feature-detect.
- **Backgrounding:** on iOS especially, mic capture and timers can be suspended when the app is backgrounded/screen locks. Detect `visibilitychange`/`pagehide`, show a "Keep Saar open during the call" banner, **pause** STT and auto-resume (and reconnect if needed) on return. Do not promise background transcription.
- **Autoplay:** call `room.startAudio()` after a user gesture so remote audio plays.
- **Permissions:** handle denied/blocked mic with instructions per platform.
- **Network switches** (Wi-Fi ↔ mobile data): LiveKit reconnects automatically; our WS clients reconnect with backoff and re-`start`.
- **Earphones advice:** show once per call: "Use earphones for best accuracy".

### 11.3 Local-first notes (`lib/notesDb.ts`)
IndexedDB via `idb-keyval` (or `idb`): store `Note{id, room_code, created_at, kind, title, participants, langs, note_json, faithfulness, transcript[], edited}`. Index by `created_at`. Search = simple in-memory filter over title/summary/entities. Export to Markdown with a deterministic template (title, date, participants, summary bullets, key points, decisions, action items table, entities, flags, optional transcript). Delete-all clears DB. The service worker caches the app shell so Notes open offline; **never cache `/api/*`**.

### 11.4 Captions UI logic
- Maintain `segments` ordered by `seq`; provisional own segments (from the STT socket `transcript`) shown immediately with a subtle "·" marker until reconciled.
- Speaker colours + names; Indic fonts via system fallback; `dir="auto"` per bubble.
- "…speaking" indicator from `processing` events and local RMS threshold.
- Debug drawer shows: end-of-speech→caption latency (client clock: time between last high-RMS frame and caption render, approximate), Gnani `latency_ms`, queue depth/dropped frames, reconnect count, audio seconds used/limit.

### 11.5 Accessibility and i18n
Captions in an `aria-live="polite"` region; all controls labelled; focus management for dialogs; UI strings in `i18n.ts` with **English + Hindi** (consent notice and critical buttons must be available in Hindi); respect `prefers-reduced-motion`.

---

## 12. Summarizer

### 12.1 Provider abstraction
```python
class LLMProvider(Protocol):
    async def generate_note(self, system: str, user: str, schema: dict, *, max_tokens: int, timeout_s: float) -> tuple[dict, Usage]: ...
```
- **AnthropicProvider** (default): use the Anthropic Python SDK with a **forced tool call** whose `input_schema` is the Note JSON schema (`tool_choice` = that tool) so output is structured. Model from `LLM_MODEL` env (⟦ASK-USER or VERIFY: current model ID at https://docs.claude.com/en/docs/about-claude/models — as of this spec Anthropic lists `claude-sonnet-5-5` and `claude-haiku-5-5` as current; a fast/cheap model is plenty for notes⟧). Temperature low (0–0.2).
- **OpenAICompatProvider**: `base_url`, `api_key`, `model`; use `response_format` JSON schema if supported, else instruct JSON-only and parse.
- **MockProvider**: deterministic canned notes for tests and offline dev.
- Retry once on schema-validation failure with the validation error appended; then mark note `failed` with a user-friendly message and keep the transcript.

### 12.2 Note JSON schema (pydantic model `Note`)
```json
{
  "title": "string ≤ 80 chars",
  "note_language": "en | hi | same",
  "summary": ["3–6 short bullet strings"],
  "key_points": [{"text": "string", "evidence": [<seq ints>]}],
  "decisions":  [{"text": "string", "evidence": [<seq ints>]}],
  "action_items": [{"task": "string", "owner": "string|null", "due": "string|null", "evidence": [<seq ints>]}],
  "entities": {"people": [], "organizations": [], "places": [], "dates": [], "amounts": []},
  "open_questions": ["string"],
  "uncertain_spans": [{"text": "string", "reason": "string", "evidence": [<seq ints>]}],
  "conversation_languages": ["en-IN", "hi-IN"]
}
```
Rules: every `evidence` list is non-empty and refers only to `seq` values present in the transcript; empty arrays allowed where nothing applies; **no field may contain a fact not present in the transcript**.

### 12.3 Prompting (store in `prompts.py`; version string `PROMPT_VERSION="v1"`)
**System prompt (use verbatim as the starting point; tune only via tests):**
```
You turn a transcript of a consented two-person phone conversation into a faithful, concise note.
The transcript comes from automatic speech recognition and may contain errors, especially for names, numbers, and mixed-language (code-mixed) speech.
Rules:
1. Use ONLY information present in the transcript. Never invent names, numbers, dates, amounts, or commitments.
2. If something is unclear, garbled, or contradictory, do not guess: add it to "uncertain_spans" with a short reason.
3. Every key point, decision, action item, and uncertain span must cite the transcript line numbers (the #N markers) that support it.
4. Preserve numbers, currency, dates, and names exactly as they appear in the transcript.
5. Keep the speaker's mix of languages where quoting; write the note in the requested note language.
6. Be brief. Do not add advice, opinions, or emotional interpretation.
Return the result by calling the provided tool.
```
**User prompt template:**
```
Note language: {note_language}   # en | same | hi
Participants: {name_a} ({lang_a}), {name_b} ({lang_b})
Transcript (format: #seq [mm:ss] Speaker: text):
{transcript_lines}
```
Transcript is truncated from the **middle** (keep first/last parts) if it exceeds `MAX_TRANSCRIPT_CHARS` (default 60,000), with a visible marker line.

### 12.4 Faithfulness check (`faithfulness.py`, deterministic, no LLM)
1. Extract candidates from the note: numbers (digits incl. Devanagari/other Indic digits → ASCII, strip commas/₹/Rs), dates/time tokens, amounts, and capitalised/proper-noun tokens from `entities`, `key_points`, `decisions`, `action_items`.
2. Normalize the transcript the same way (case-fold, Unicode NFKC, strip punctuation, number-words→digits for en/hi basics where feasible).
3. A candidate is **supported** if it appears in the transcript (exact or fuzzy ≥ 0.9 via `rapidfuzz` for names) — else add to `flags[]` with `{field, value, reason:"not_found_in_transcript"}`.
4. Validate evidence: all cited `seq` exist; otherwise flag `bad_evidence`.
5. Output `{flag_count, flags[], checked_count}`. UI shows ⚠ chips and a "N items could not be verified in the transcript" banner. **Never auto-delete flagged items**; show them.
6. Unit-test with seeded hallucinations (e.g., add "₹9,999" not in transcript → flagged).

### 12.5 When notes are generated
- **Quick note:** on demand, from segments so far (min 3 segments).
- **Final note:** on `end`. If STT failed mid-call, still generate from what exists and say so in the note header.
- Cost guard: cap `max_tokens` (e.g., 1,500), one retry max; log token usage to `usage`.

---

## 13. Consent, privacy, and legal posture

### 13.1 Design rules (enforced in code and tests)
- Capture cannot begin until the server has recorded `granted` for **every** participant against the **current notice version**; the server, not the client, enforces this.
- Revocation is one tap, always visible during a call, and stops capture for everyone immediately.
- The recording indicator is always visible while capture is active; there is no way to hide it.
- Audio is never stored. Text is retained on the server for `SERVER_RETENTION_HOURS` (default 24) and on each device until the user deletes it.
- Third parties that receive data: **Gnani AI** (receives audio for transcription), the **LLM provider** (receives transcript text), **LiveKit** (relays call audio). The notice names them.
- Minimal data: display names are free text; no phone numbers, emails, or accounts. Do not log IPs beyond what the host platform does by default.
- A **Demo mode** banner ("Prototype for the Great Indian AI Internship Challenge. Use only synthetic or consenting-teammate conversations.") is on by default (`DEMO_MODE=true`).

### 13.2 Consent notice (versioned; store EN + HI; `NOTICE_VERSION="2026-10-v1"`; hash the exact displayed text with SHA-256)
**English:**
> **Before you talk — please read.**
> Saar will transcribe **your own voice** during this call using Gnani AI's speech-to-text service, then create a short summary note using an AI language model (**⟦ASK-USER: LLM provider name⟧**). The call audio is relayed by LiveKit. **Your voice audio is not saved.** The text transcript and note are kept on our server for up to **24 hours** so both of you can receive them, then deleted. Notes are also saved on each person's phone.
> Everyone on the call must agree. You can **stop at any time** with the Revoke button, which stops transcription for everyone. This is a prototype: use it only for test or consenting conversations.
> ☐ I agree to the transcription and summary described above.

**Hindi (have the human review wording before shipping):**
> **बात शुरू करने से पहले, कृपया पढ़ें।** Saar इस कॉल में **आपकी अपनी आवाज़** को Gnani AI की स्पीच-टू-टेक्स्ट सेवा से टेक्स्ट में बदलेगा और फिर AI भाषा मॉडल से एक छोटा सारांश नोट बनाएगा। कॉल की आवाज़ LiveKit के ज़रिये पहुँचाई जाती है। **आपकी आवाज़ की रिकॉर्डिंग सेव नहीं की जाती।** टेक्स्ट और नोट हमारे सर्वर पर अधिकतम **24 घंटे** रखे जाते हैं ताकि दोनों को मिल सकें, फिर हटा दिए जाते हैं। नोट हर व्यक्ति के फ़ोन में भी सेव होते हैं। कॉल पर सभी की सहमति ज़रूरी है। आप **कभी भी रोक सकते हैं**; रोकने पर सभी के लिए ट्रांसक्रिप्शन बंद हो जाएगा।
> ☐ मैं ऊपर बताए गए ट्रांसक्रिप्शन और सारांश के लिए सहमत हूँ।

### 13.3 Docs you must write (`docs/CONSENT_AND_PRIVACY.md`)
What data flows where (a table), retention, third parties, what is *not* done (no PSTN tapping, no audio storage), and a plain statement: *"This is not legal advice. Commercial deployment in India would require a compliance review against the Digital Personal Data Protection Act, 2023 and Rules, and applicable sector rules."* ⟦ASK-USER: preferred official source link to cite⟧.

---

## 14. Testing strategy

### 14.1 Unit tests (backend)
- Header builder: correct names/values, bias list `\u` escaping, `x-format` switching, rejects >100 words / non-letters / invalid score (Gnani silently ignores invalid boosting — we must validate *before* sending and warn the user).
- Pacer: emits one frame per 32 ms ±5 ms under steady input; catches up ≤1.25×; drops oldest on overflow; never bursts.
- Frame validator: rejects non-1024-byte frames.
- Consent state machine: all transitions, stale notice version, revoke during active, 3rd participant.
- Reorder buffer: out-of-order arrivals sorted; hold 1.5 s; `seq` monotonic.
- Echo dedupe: synthetic overlap pairs.
- Faithfulness: seeded hallucinations flagged; correct notes pass; Indic digit normalization.
- Summarizer: schema validation, retry path, evidence validation (mock provider).
- Retention job: purges old data, keeps fresh.

### 14.2 Integration tests (backend, with `scripts/fake_gnani_server.py`)
The fake server **must mimic the real protocol**: validates upgrade headers, sends `connected`, tracks frame sizes/cadence, emits `processing` then `transcript` (with `audio_duration_ms`, `segment_id`, `segment_index`, `latency`) after configurable silence, supports `update_settings` → `settings_updated`, can inject `error`, can **close at 15 min of simulated time** to test rotation, and can refuse a 2nd concurrent connection to test the concurrency-limit fallback. Tests: full room flow over real WebSockets with two simulated clients streaming a WAV file (resampled to 16 kHz PCM frames) and asserting ordered captions on both; revoke mid-call; rotation; upstream failure → `failed` state visible; budget guard.

### 14.3 Frontend tests
- Vitest: resampler (sine tests for aliasing), framer (exactly 1,024 B), notes DB, Markdown export, i18n completeness, consent UI gating.
- **Playwright e2e** with two browser contexts and Chromium flags `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>` (⟦DOC: playwright.dev⟧), `CALL_AUDIO_PROVIDER=none`, backend pointed at the fake Gnani server and `MockProvider`. Asserts: consent gating, captions on both pages, quick note appears in Notes, delete works, revoke stops captions.

### 14.4 Manual device test matrix (before recording the demo)
Two real phones (ideally one Android + one iPhone), same Wi-Fi and one on mobile data; earphones vs loudspeaker; quiet room vs noisy room; screen lock behaviour; Hindi/English/Hinglish scripts; airplane-mode toggle recovery; low battery. Record results in `docs/DEVICE_TEST.md`.

---

## 15. Evaluation harness (the "research" part; `eval/`)

**Goal:** produce honest, reproducible measurements of how Prisma + our pipeline behave under telephony-style degradation, and how that propagates to the final note.

### 15.1 Dataset
- `eval/dialogues/*.yaml`: 24–36 short two-speaker dialogues (≈30–60 s each) across 3 domains (kirana order, clinic appointment, service complaint) in `en-IN`, `hi-IN`, and Hinglish. Each file: `turns:[{speaker:A|B, lang, text}]`, `gold_facts:[…]` (names, amounts, dates, items), `gold_actions:[…]`.
- Generate drafts with the LLM, then **require human review of a sample** (ask the human to check ≥ 20%). Use obviously fictional names/numbers.
- Synthetic audio via **Gnani TTS** (⟦DOC: tts-inference.md⟧), two different voices, speaker tracks mono and time-aligned (silence where the other speaks) — mirrors the product's per-speaker design.
- If real clips exist (Checkpoint C item 9), include them as a separate "real" split and report separately.

### 15.2 Degradations (`degrade.py`, deterministic with a seed)
1. **Clean** baseline (16 kHz).
2. **Telephone band:** band-pass 300–3,400 Hz → resample 8 kHz → µ-law encode/decode (G.711-like); send with `x-sample-rate: 8000`.
3. **Additive noise at SNR 20 / 10 / 5 / 0 dB** with noise types: white, pink, **babble** (sum of 4–6 other TTS voices), "street" (synthesized filtered bursts), plus user-provided noise files if any.
4. **Packet loss:** zero out random 20–60 ms chunks at 5 / 10 / 20 %.
5. **Combos:** telephone + 10 dB babble; telephone + 10 % loss.
6. **Mic processing:** with vs without browser-style noise suppression (apply a simple spectral-gate as a stand-in; label clearly as an approximation).

### 15.3 Experiments
- **E1:** WER/CER and entity recall vs. SNR/degradation, per language.
- **E2:** VAD presets (`threshold 0.5 vs 0.7`, `min_silence 500 vs 700 vs 900`) → WER, segment fragmentation (segments per sentence), latency.
- **E3:** Word boosting on/off for fictional names/brands (score 1.0 vs 2.0), `x-format verbatim` vs `transcribe` effect on number accuracy.
- **E4:** Propagation to notes: key-fact recall (LLM-judged *or* fuzzy match of gold facts in the note), hallucinated-entity rate, faithfulness-flag precision/recall (flags vs. actual errors).
- **E5 (optional):** REST vs WebSocket on same clips.

### 15.4 Metrics and normalization
WER/CER with `jiwer` after normalization (lowercase, strip punctuation, collapse whitespace, Indic digit→ASCII, ITN-vs-verbatim aware comparison — evaluate numbers with a numeric-equality metric rather than string WER). Latency from `latency` field and wall-clock per-segment. Report mean, median, p95 with bootstrap 95 % CI where n allows.

### 15.5 Running safely within credits
`python eval/run_eval.py --plan` prints total audio seconds per experiment and the grand total; refuses to run without `--yes` if total exceeds `EVAL_MAX_AUDIO_SECONDS` (default 1,200). Use **REST** for wide sweeps (faster than real-time) and **WebSocket at real-time pace** only for a smaller subset (E2, latency). Run conditions concurrently up to a configured connection limit. Cache results by `(clip_hash, config_hash)` to avoid re-spending credits.

### 15.6 Outputs
`eval/results/results.csv`, `charts/*.png` (WER vs SNR lines per language; entity recall; latency boxplots; VAD-preset trade-off scatter; WER→note-fact-recall scatter), and **`report.md`** containing method, tables, charts, and a mandatory **Limitations** section:
- TTS-generated speech ≠ real speech; same-vendor TTS→STT is likely optimistic.
- Simulated noise/telephony is an approximation.
- Small n; CIs are wide; no claim of superiority over any vendor.
- Numbers describe *this* setup on *these* dates; vendor-reported figures are labelled as such.

---

## 16. Build plan (phases, tasks, acceptance criteria)

> Calendar assumes **start Oct 29**, ship **Nov 9**, buffer Nov 10. Adjust if started later; the order matters more than the dates.

### Phase 0 — Preflight (Oct 29) ✦ tag `phase-0-done`
**Tasks:** read §2 docs; create repo skeleton (§6); `.env` from `.env.example`; implement `scripts/smoke_*`; run them; run **concurrency test** (open 2 STT sockets with one key), **idle-timeout test** (open socket, send nothing for 60 s), **credit-meter probe** (send 10 s of audio, compare dashboard usage if visible), `x-partials` check (try the header; inspect messages). Record all in `PROGRESS.md`.
**Accept:** (1) STT REST + WS return Hindi/English transcripts from a sample WAV; (2) LLM smoke returns valid JSON; (3) TTS smoke produces a playable WAV; (4) findings on concurrency/idle/partials documented; (5) checkpoint A answers recorded.

### Phase 1 — Backend core (Oct 29–30) ✦ `phase-1-done`
**Tasks:** config, logging w/ redaction, DB models, JWT, rate limiter; Gnani STT client (header builder, pacer, rotation skeleton); fake Gnani server; unit tests.
**Accept:** unit tests green; pacer within ±5 ms; fake-server integration test streams a WAV and gets ordered transcripts.

### Phase 2 — Mic → captions (Solo mode) (Oct 30–31) ✦ `phase-2-done`
**Tasks:** Vite app shell, Home/Setup pages; AudioWorklet resampler/framer; `/ws/stt` proxy end-to-end; captions list; recording dot; wake lock; Solo mode; consent card (self-only) wired to server.
**Accept:** on a real phone over HTTPS tunnel, speaking Hindi/English shows captions; frames are exactly 1,024 B (assert in test); latency badge works; denying consent prevents capture.

### Phase 3 — Two phones, call, consent, merge (Oct 31–Nov 2) ✦ `phase-3-done` (Checkpoint B first)
**Tasks:** rooms/join/consent/start/end; LiveKit tokens + client; room hub, reorder buffer, echo dedupe; Lobby/Call pages; revoke flow; budget guard; e2e tests with `CALL_AUDIO_PROVIDER=none`.
**Accept:** two real phones in one call hear each other, see **both** speakers' captions in order; revoke on either phone stops capture on both within 1 s; third join rejected; e2e green.

### Phase 4 — Notes (Nov 2–4) ✦ `phase-4-done`
**Tasks:** summarizer service + providers + schema + faithfulness; quick/final note endpoints; `note_ready` events; IndexedDB notes; Notes list/detail; Markdown export; evidence chips; ⚠ flags; server-side delete.
**Accept:** end-to-end: finish a scripted call → note appears on both phones' Notes; seeded hallucination test is flagged; note survives app reload and offline open; schema-invalid LLM output triggers retry then graceful failure.

### Phase 5 — Hardening (Nov 4–6) ✦ `phase-5-done`
**Tasks:** 15-minute rotation test (simulated), reconnect UX, backgrounding handling, PWA manifest/service worker (cache shell only), CSP/headers, rate limits, retention job, error copy, Hindi UI strings, debug drawer, empty/loading states, accessibility pass.
**Accept:** forced upstream drop recovers or shows a clear failure; 20-minute simulated call rotates without lost captions; Lighthouse PWA/accessibility reasonable (report scores); no secrets in client bundle (grep test) or logs (log-capture test).

### Phase 6 — Evaluation (Nov 5–7, in parallel where possible) ✦ `phase-6-done` (Checkpoint C first)
**Tasks:** dialogues, audio generation, degradations, runner with plan/guard/cache, metrics, charts, `report.md`.
**Accept:** `eval/results/report.md` with ≥ E1 + E2 + E4 results, charts, and limitations; reproducible with one command; credit usage recorded.

### Phase 7 — Ship (Nov 7–9) ✦ `phase-7-done` (Checkpoint D first)
**Tasks:** Dockerfile/compose; deploy; README (§17); `docs/*`; device test log; 60-s demo script; fallback pre-recorded demo; LinkedIn/X post drafts; submission text.
**Accept:** public HTTPS URL works from two phones on different networks; README complete; demo rehearsed twice; submission draft ready; final commit tagged `v1.0`.

### 16.9 Cut list (drop in this order if behind schedule)
1. S1–S4 optional features. 2. E3/E5 experiments. 3. Hindi UI strings beyond consent + critical buttons. 4. Echo dedupe (keep headphone advice). 5. Debug drawer details. 6. PWA service worker (keep manifest). **Never cut:** consent gating, revoke, recording indicator, faithfulness check, no-audio-at-rest, honest limitations.

---

## 17. Contest deliverables (generate drafts; the human posts them)

### 17.1 README.md must contain
Title + 1-line pitch; **screenshots/GIF**; what it does; **Gnani models/APIs used** (Prisma v2.5 realtime STT via WebSocket; optional Timbre TTS; REST STT in eval) and exactly where; **non-Gnani components** (LLM provider, LiveKit) stated plainly; architecture diagram (from §4); quick start (local + Docker); env vars table; how to run tests and eval; **consent and privacy summary**; **Limitations** (§17.3); **team contribution table** (per member: tasks); license; acknowledgements; hashtags `#GnaniAI #GreatIndianAIInternshipChallenge`.

### 17.2 Demo (≤ 60 s) — `docs/DEMO_SCRIPT.md`
- 0–8 s: hook ("Notes from a call, with consent, in Hinglish").
- 8–18 s: two phones, consent screens, both tap *I agree*.
- 18–40 s: scripted noisy-ish conversation; captions appear on both; Quick note.
- 40–52 s: End → structured note in Notes with ⚠ flag shown once (honesty moment) and evidence chip.
- 52–60 s: noise-vs-WER chart from the eval + call to action + hashtags.
Record on-screen with both phones visible; use **synthetic/role-played dialogue only**.

### 17.3 Limitations to state publicly
App-to-app VoIP, not phone-network calls; per-utterance (not word-by-word) captions unless partials verified; browser background limits on phones; echo on loudspeaker; eval uses synthetic/TTS audio plus small real set; summaries can still err (flags reduce but don't eliminate this); single-instance prototype; consent flow is a prototype and not a compliance certification; Evon not used (not on API platform) unless adapter S3 is built.

### 17.4 Submission checklist (deadline Nov 10, 2026, 11:59 PM IST; aim Nov 9)
☐ Public post live on LinkedIn and/or X with demo video, both hashtags, Gnani tagged ☐ Post nominated in submission ☐ Written project explanation ☐ Models/APIs listed ☐ Each member's contribution recorded ☐ Only synthetic/consenting data shown ☐ Repo public and README polished ☐ No purchased/botted engagement (disqualifying).

---

## 18. Configuration (`.env.example`)
```
# --- Core ---
APP_ENV=dev                  # dev|prod
PUBLIC_BASE_URL=https://localhost:8000
JWT_SECRET=change-me
DEMO_MODE=true
SERVER_RETENTION_HOURS=24
DATABASE_URL=sqlite:////data/saar.db
LOG_LEVEL=INFO
LOG_TRANSCRIPTS=false

# --- Gnani ---
GNANI_API_KEY=
GNANI_STT_WS_URL=wss://api.vachana.ai/stt/v3/stream
GNANI_BASE_URL=https://api.vachana.ai
STT_VAD_THRESHOLD=0.5
STT_MIN_SILENCE_MS=700
STT_MIN_SPEECH_MS=100
STT_MIN_SEGMENT_MS=120
STT_MAX_SPEECH_S=               # empty = disabled
STT_FORMAT_DEFAULT=transcribe
STT_PARTIALS=false              # enable only if verified in Phase 0
MAX_STT_SECONDS_PER_ROOM=1800
GNANI_WS_URL_OVERRIDE=          # point to fake server in tests

# --- Call audio ---
CALL_AUDIO_PROVIDER=livekit     # livekit|none
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# --- LLM ---
LLM_PROVIDER=anthropic          # anthropic|openai_compat|mock
ANTHROPIC_API_KEY=
LLM_MODEL=
OPENAI_COMPAT_BASE_URL=
OPENAI_COMPAT_API_KEY=
MAX_TRANSCRIPT_CHARS=60000
NOTE_MAX_TOKENS=1500

# --- Behaviour ---
ECHO_DEDUPE=true
MIC_AEC=true
MIC_NS=true
MIC_AGC=true
RATE_LIMIT_PER_MIN=20

# --- Eval ---
EVAL_MAX_AUDIO_SECONDS=1200
```

---

## 19. Deployment

- **Dev:** `uvicorn app.main:app --reload` (backend) + `vite` (frontend proxy to backend) → expose with `cloudflared tunnel --url http://localhost:8000` (or ngrok) so phones get HTTPS. ⟦VERIFY tunnel command syntax in provider docs⟧.
- **Prod (demo):** single Docker image: stage 1 builds frontend (`npm ci && npm run build`), stage 2 installs backend, copies `frontend/dist` to `backend/app/static`, runs `uvicorn --workers 1` (single worker is required by the in-memory hub). Deploy to ⟦ASK-USER: Render/Fly/Railway⟧; ensure **WebSocket support** and an HTTPS URL; set env vars as secrets; health check `/api/health`.
- **docker-compose.yml:** `app` service; optional `livekit` profile running `livekit/livekit-server --dev` for fully local testing (then phones need a tunnel to both app and LiveKit).
- Pre-demo: warm the instance (cold starts break demos), test from mobile data, keep a **pre-recorded fallback video**.

---

## 20. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Key allows only 1 concurrent STT socket | Two-phone captions fail | Phase 0 test; if limited, ask Gnani on Discord; fallback: route both speakers' audio through **one** backend session is not possible (speaker mixing) → instead alternate "turn-taking mode" or use two keys (3 free keys exist) — ask human |
| iOS suspends mic in background | Missed speech | Foreground banner, pause/resume UX, honest limitation |
| Loudspeaker echo duplicates captions | Messy transcripts | AEC constraints, headphone advice, dedupe heuristic |
| Per-utterance captions feel slow | Weak demo | Tune `min_silence` (600–700), verify `x-partials`, "…speaking" indicator |
| LLM hallucination in notes | Trust loss | Evidence citations + deterministic faithfulness check + visible flags |
| Credits exhausted | Demo fails | Usage meter, budget guard, eval cache, keep ≥ 30 % reserve for demo day |
| LiveKit/free-tier limits or network | Call audio issues | Independent ASR path; `none` fallback; test early on mobile data |
| Time overrun | Missed deadline | Cut list §16.9; ship by Nov 9 |
| Legal/consent misunderstanding | Reputational | Consent-first design, synthetic data, explicit limitations, no PSTN |

---

## Appendix A — Fake Gnani server requirements (precise)
Implements `wss://…/stt/v3/stream` locally: reject missing `x-api-key-id`; require `lang_code`; echo `connected{config:{sample_rate,chunk_size:512}}`; count frames; flag any frame ≠ 1,024 B as `error`; measure inter-frame gaps and expose them to the test (pacer assertions); simple energy-based VAD over received PCM; after `min_silence_ms` of silence send `processing` then (after a configurable fake latency) `transcript{text: from a provided script queue, audio_duration_ms, segment_id (uuid), segment_index (0..), latency}`; handle `update_settings` → `settings_updated`; hooks: `inject_error()`, `close_after(seconds)`, `max_connections(n)`.

## Appendix B — Frontend/Backend type parity
Generate TS types from pydantic via `datamodel-code-generator`/OpenAPI (REST) and hand-maintained TS unions for WS messages; add a test that parses sample JSON for every message type on both sides.

## Appendix C — Definition of Done (whole project)
All phases accepted; `pytest` and `vitest` and `playwright` green; `eval/results/report.md` present; README complete; two-phone call demo works on real devices over HTTPS; consent gating and revoke verified on device; no secrets in repo/bundle/logs; `PROGRESS.md` up to date; tagged `v1.0`.

## Appendix D — First message to send the human (after reading this spec)
> "I've read the spec. Before Phase 0, please send: (1) `GNANI_API_KEY`; (2) credit-consumption info if known; (3) LLM choice + key; (4) demo languages and scenario; (5) team size and handles. I'll start with environment setup and the smoke tests while you gather LiveKit credentials (needed at Phase 3)."
