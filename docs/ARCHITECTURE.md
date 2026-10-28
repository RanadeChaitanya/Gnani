# Architecture

## Two audio paths, on purpose
- **Call audio** (what you hear): LiveKit WebRTC, audio only. Optional: with `CALL_AUDIO_PROVIDER=none` captions still work.
- **ASR audio** (what gets transcribed): each phone's **own** mic → AudioWorklet → 16 kHz mono PCM s16le in exact 1,024-byte frames (32 ms) → `WS /ws/stt/{room}` → backend → Gnani. The same mic track feeds both paths (one capture), but a LiveKit outage never breaks captions.

## Browser capture (`frontend/src/audio/`)
`resampler.ts` runs inside the worklet: 63-tap windowed-sinc low-pass at 7.2 kHz, then linear interpolation at the 16 kHz instants (for 48 kHz this is FIR + decimate-by-3; for 44.1 kHz the low-pass makes interpolation safe). Unit-tested: 1 kHz and 7 kHz pass, 12 kHz (which would alias to 4 kHz) is suppressed > 26 dB. Frames are posted as transferable `ArrayBuffer`s; the main thread sends them immediately and drops (never blocks) if the socket backs up > 64 KB.

## STT proxy (`backend/app/ws/stt_proxy.py`, `gnani/stt_client.py`)
- First frames: `{"type":"auth"}` then `{"type":"start","sample_rate":16000}`. The server checks token, room `active`, and **all** participants `granted` before opening Gnani.
- **Pacer**: one frame per 32 ms on `time.monotonic()`; backlog > 10 frames → catch up at ≤ 1.25×, back to 1× at ≤ 3; overflow (> 3 s) drops oldest and counts it. Never bursts, even after a gap.
- **Rotation** (15-min Gnani cap): from 13:00, rotate at the first idle moment (no pending segment, ≥ 1.5 s without speech); from 14:45, rotate right after the next `processing` (end of speech) so no utterance is split; forced at 14:58. The new socket opens first; the old one drains its pending transcript (≤ 3 s) and closes.
- **Reconnect**: unexpected close → 0.5 s / 1 s / 2 s backoff → `upstream_status: failed`, shown in the UI. Capture is never silently "pretending".
- **Mute / background**: client sends `pause`; nothing is forwarded (no silence is billed). `resume` reconnects lazily if Gnani closed the idle socket.
- **Budget**: audio seconds actually sent upstream are metered per room; at `MAX_STT_SECONDS_PER_ROOM` capture stops for both with a clear message.

## Room hub (`backend/app/ws/room_hub.py`)
- Segment times on the server clock: `ended ≈ receive − latency`, `started = ended − audio_duration`, so both speakers are comparable.
- Reorder buffer holds each segment 1.5 s, then releases it together with anything that started earlier, sorted by start, assigning a global `seq` (the note's citation numbers).
- Echo heuristic: overlapping (± 600 ms) segments from the other speaker with token-set similarity ≥ 85 → the quieter (client RMS) or later one is marked `possible_echo` and hidden (visible in Debug).

## Notes (`backend/app/summarizer/`)
Ordered, non-echo segments → `#seq [mm:ss] Speaker: text` (middle-truncated past 60 k chars) → DeepSeek in JSON mode with the Note JSON schema in the system prompt → pydantic validation (every `evidence` list non-empty) → one retry with the validation error → `failed` (transcript kept). Then `faithfulness.py` (deterministic): every number (Indic digits normalised, Indian comma grouping, basic en/hi number words) and every person / organisation / place / owner must appear in the transcript (exact or fuzzy ≥ 90), and every cited `seq` must exist. Flags are shown, never auto-deleted.

## State machine
```
LOBBY ──(all consent granted ∧ host Start)──► ACTIVE ──(End)──► ENDED
  ▲                                              │
  └──────(any revoke · budget exhausted)─────────┘   capture stops for everyone
```

## Scaling note
Single process, in-memory hub (uvicorn `--workers 1`). Horizontal scale would need Redis pub/sub for the hub and sticky WebSocket routing — not built.
