# Saar v2 — improvements from the first real two-phone test (2026-10-28)

Evidence came from the test session's own data (transcripts, usage counters, notes, server log), not guesses.

## What went wrong, and why
| # | Symptom | Evidence | Root cause |
|---|---|---|---|
| A | "Garbled, meaning nothing" | Guest streamed 31 s → **0 captions**; host 37 s → 2 captions | Audio reached Gnani but contained (almost) no detectable speech for the guest. No mic diagnostics existed, so neither phone could tell. Likely candidates: silent/low mic track on that phone, or echo cancellation suppressing speech while the other person's voice played on loudspeaker. |
| B | Hinglish poor | `dus kilo`, `pachas rupay` stayed words; "interview" probably misheard | `en-IN` + ITN doesn't convert romanised Hindi numbers; no domain vocabulary; no measured choice between `en-IN` and `hi-IN` for Hindi-heavy Hinglish. |
| C | Note format poor, "what is DeepSeek doing" | Note = generic summary/key points; "unclear what pachas rupay relates to" | Generic schema. No items/quantities/prices, no per-shop totals, no locations or schedule. The prompt doesn't know the Indian small-business context. |
| D | No good output file | Only on-screen view + raw Markdown | No formatted, shareable document (PDF / WhatsApp text). |
| E | Connecting is weird | Guest made an empty room first, then joined; 4 screens and 3 taps before talking | Setup → lobby → long notice → agree → host Start. No QR. Consent separate from joining. |
| F | Connection poor | Guest upstream reconnected once; all audio goes phone → Cloudflare → home PC → Gnani | Home-PC tunnel adds a hop and depends on home upload. No presence/connection status for the other person. |
| G | UI poor | — | Text-heavy, generic buttons, no call-screen feel, note isn't a document. |
| H | Bugs | Two final notes for one call; client IPs in server log | `/end` race (no per-room lock); uvicorn access log prints IPs. |

## v2 improvements (priority order)

### P0 — make audio problems visible and fix correctness
1. **Live mic level meter** on each phone, plus a **"your mic isn't picking up speech"** warning after 4 s of near-silence while capturing.
2. **Server-side audio health per session** (logged without content): seconds sent, speech-frame ratio, mean level, upstream close codes. The next test tells us exactly which phone or step failed.
3. **One controlled mic capture**: the app opens the mic itself with known constraints and publishes that same track to the call. Transcription taps the same track, so no surprises from a second capture.
4. **Fix the `/end` race** (one final note per call) and **remove IPs from logs**.

### P1 — notes people actually want
5. **Note schema v2**: conversation type (order / appointment / complaint / general); **items** (name, qty, unit, unit price, line total, shop); **shops / parties**; **locations** (address or landmark + role: delivery / pickup / meeting); **schedule** (what, when, where); **requirements** (what the customer needs); **payments**; action items; open questions. Every line still cites the transcript.
6. **Totals computed by code, not the LLM**: per-shop subtotal and grand total from the items; any total the AI states that disagrees is flagged ⚠.
7. **Hindi/Hinglish/Marathi number understanding**: ek…sau, hazaar, lakh, saade/dhai, Devanagari and romanised. Used by the faithfulness check (so "₹50" is verified against "pachas rupay") and shown next to quotes.
8. **Prompt v2**: knows it's Indian code-mixed ASR, converts number words to digits, translates meaning into clear English, keeps the original phrase as a quote, never invents prices or places.
9. **Formatted output**: a clean note document (order table, totals per shop, locations, schedule) with **Download PDF** (print-ready), **Share to WhatsApp** (formatted text), Markdown, and items CSV.

### P2 — better Hinglish recognition (measured, not guessed)
10. **A/B test on Hinglish clips**: `en-IN` (ITN) vs `en-IN` + domain word boosting vs `hi-IN`. Pick the default from WER and number accuracy.
11. **Scenario presets** (Shop order / Appointment / General): domain vocabulary boosted in Gnani (atta, chawal, dal, kilo, packet, rupaye…) and note emphasis.
12. Language picker in plain words: "Hinglish (Roman letters)", "Hindi (देवनागरी)", "Marathi (मराठी)", …

### P3 — clean, smart connection and UI
13. **One-tap join**: host gets a **QR code** + link; the guest scans and sees a single card (name, language, the consent notice, **Agree & join**). The host's consent is "Agree & start when they join", so transcription **starts automatically** once both have agreed.
14. **Call screen like a phone call**: the other person's name, presence (joined / left / reconnecting), call timer, transcription indicator, big readable captions with live words, and a bottom bar with icon buttons (Mute · Note · Stop · End).
15. **Notes screen as a document**: an order card with totals, locations, schedule, requirements, then the transcript tab.
16. **Host closer to users** (Checkpoint D): run in a cloud region in India instead of through the home PC tunnel.

## Status (2026-10-28, v2 built)
| # | Done | Evidence |
|---|---|---|
| 1–2 Mic meter, silent-mic warning, server audio-health log | ✅ | Health log found the v2 crash on its first run (0.5 s of audio, level 0) |
| 3 One mic capture → call + transcription | ✅ | `lib/media.ts`, LiveKit `publishTrack` |
| 4 `/end` race, no IPs in logs | ✅ | test `test_double_end_makes_one_note_and_preview`; uvicorn access log off |
| 5–8 Note v2, code totals, Hinglish/Marathi numbers, prompt v2 | ✅ | Live: real Gnani + DeepSeek on kirana dialogues → items with qty/unit, spoken totals ₹280 / ₹210→₹250, "today 18:00", 0–1 flags |
| 9 PDF / WhatsApp / CSV / Markdown | ✅ | unit tests on all exports |
| 10–12 Hinglish A/B, scenario vocabulary, plain language names | ✅ | `eval/results/hinglish_ab.md`: WER 18.2 % → 14.8 % |
| 13–15 QR + one-tap Agree & join + auto-start, call screen, note document | ✅ | e2e (2 tests) + screenshots in `docs/screenshots/` |
| 16 Host in an India cloud region | ⏳ | Checkpoint D |

Also fixed along the way: Python `\w` split Devanagari words (affected the faithfulness check); Chrome's `scrollIntoView` now returns a Promise, which crashed React when returned from an effect.
Not yet measured: word boosting for Devanagari languages (Marathi "kele" was heard as "केरी").

## v3 (same day, after the v2 phone test)
- **Gnani limit, measured:** `/stt/v4/stream` returns word-for-word the same as v3 — one model, no better key to buy. On 6 realistic Hinglish orders (TTS, 32 items+numbers): hi-IN spoken-form 97 %, en-IN 94 %, en-IN + v2 vocabulary 84 % → v2 vocabulary removed; Hindi/Hinglish now defaults to hi-IN spoken form; Saar parses numbers.
- **Note step:** prompt/schema v3 — one-sentence outcome, misheard-word repair with `heard_as` ("har bhara daur" → arhar dal), crosstalk merge with a confirm question ("Sugar: 8 kg or 50 kg?"), no line-by-line translation. Recovered numbers are labelled "inferred", not hidden.
- **UI:** note = outcome → Please check → items → when/where → to do → Share; everything else under More. Entry = name, language, one-sentence consent, Agree. Home = two buttons.
- **Setup advice:** two phones in one room transcribe both voices; test in separate rooms or with earphone mics.
