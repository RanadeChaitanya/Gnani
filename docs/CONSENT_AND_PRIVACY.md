# Consent and privacy

## How consent works
1. Each participant reads the notice on their **own** device (English or Hindi). Notice version `2026-11-v2`; the server stores the SHA-256 of the exact displayed text with every consent event.
2. The server refuses to open any speech-recognition stream unless the room is active **and every participant** has `granted` against the current notice version. A stale notice version is rejected.
3. Either participant can tap **Revoke consent / Stop** at any time. The server closes both speech streams immediately and tells both phones (tested: < 1 s). Restarting needs fresh consent from both.
4. While capture is on, a "Transcribing" indicator is always visible on both phones; there is no way to hide it, and there is no background, silent or third-party mode.

## Data flows
| Data | Goes to | Why | Kept |
|---|---|---|---|
| Your microphone audio | Saar server (in memory, ≤ ~3 s queue) → **Gnani AI** | Speech-to-text | Never written to disk, database or logs by Saar |
| Call audio | **LiveKit** (WebRTC relay) → the other phone | The voice call itself | Not recorded by Saar |
| Transcript text | Saar server (SQLite) | Ordering, sharing captions, making notes | ≤ 24 h, or immediately on "Delete from server" |
| Transcript text | **DeepSeek** | Writing the note | Per DeepSeek API terms |
| Notes | Each phone (IndexedDB) | Your copy | Until you delete it |
| Consent log | Saar server: participant id, action, notice version + hash, time. **No IP, no transcript** | Proof of consent | ≤ 24 h |
| Display name, language | Saar server | Labels | ≤ 24 h |

No accounts, no phone numbers, no emails. Logs never contain transcripts (unless a developer sets `LOG_TRANSCRIPTS=true` at DEBUG level), API keys or tokens (redaction filter, tested).

## What Saar does not do
- It does **not** tap, intercept or record phone-network (PSTN/SIP) calls. The call is app-to-app.
- It does **not** store audio.
- It does **not** transcribe the other person's voice from your phone — each phone transcribes only its own microphone.

## Legal posture
This is a prototype for a hackathon, using synthetic or consenting-teammate conversations only. **This is not legal advice. Commercial deployment in India would require a compliance review against the Digital Personal Data Protection Act, 2023 and Rules, and applicable sector rules.** Official source: ⟦preferred MeitY link — to confirm with the team⟧.

## Provider data use (checked 2026-11-04)
- **End of call:** audio stops reaching Gnani when the call ends, is stopped, or 20 s after a phone closes Saar. Tested: `test_no_audio_reaches_gnani_after_the_call_ends`, `test_closing_saar_mid_call_ends_it_for_both`.
- **Gnani:** the public privacy policy and EULA do not mention audio, voice data or model training; the EULA allows collected data to be used to enhance product performance. No opt-out is documented. Get written confirmation, or use their private/on-prem deployment.
- **DeepSeek:** the Open Platform terms do not address training; the privacy policy lists model training as a purpose, offers an opt-out by email (privacy@deepseek.com), and does not clearly cover API use. Data may be stored in China.
- Saar therefore makes **no no-training promise** to users. The consent notice (2026-11-v2) says so.
