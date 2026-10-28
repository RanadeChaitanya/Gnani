# Submission drafts (the team posts these — never buy or bot engagement)

## Project explanation (for the submission form)
**Saar** turns a two-person phone conversation into a faithful, structured note — with both people's explicit consent. Two phones join an app-to-app voice call; after both tap "I agree", each phone streams only its own microphone to Gnani Prisma realtime speech-to-text, so captions are speaker-labelled for free and each person controls only their own voice. Either person can revoke at any time and transcription stops for both. At the end, an LLM writes a note with summary, decisions and action items; every point cites transcript lines, and a deterministic check flags any number or name that is not in the transcript. Notes live on each phone; the server keeps text for 24 h and never stores audio. It works across languages in one call (we demo Hinglish + Marathi), and our evaluation measures how Prisma holds up under telephone-band audio, babble noise and packet loss, and how those errors propagate into the notes.

**Gnani models/APIs used:** Prisma v2.5 realtime STT (WebSocket) for all live captions; Prisma STT REST and Timbre v2.5 TTS in the evaluation harness. **Other components:** DeepSeek (note writing), LiveKit (call audio).

**Team contributions:** ⟦Member 1⟧ — ⟦…⟧; ⟦Member 2⟧ — ⟦…⟧.

## LinkedIn post
Ever finished a phone call and lost track of who promised what? 📞📝

We built **Saar (सार)** for the Great Indian AI Internship Challenge by @Gnani.ai: two phones, one call, live captions in **Hinglish and Marathi**, and a structured note at the end — but only after *both* people tap "I agree".

🔒 Consent-first: each phone transcribes only its own voice, either person can stop it any time, no audio is ever stored
🗣️ Code-mixed speech via Gnani Prisma realtime STT
✅ Every note point links to the exact transcript line; anything unverifiable is flagged ⚠
📊 We measured accuracy under telephone audio, crowd noise and packet loss — chart in the video

Demo (60 s) 👇 · Code: ⟦repo URL⟧
#GnaniAI #GreatIndianAIInternshipChallenge

## X post
Saar (सार): two phones, one call, live Hinglish + Marathi captions, and a faithful note at the end — only after both people consent. Built on @⟦gnani handle⟧ Prisma STT. Every point cites the transcript; unverifiable bits are flagged. 60-s demo 👇 ⟦repo⟧ #GnaniAI #GreatIndianAIInternshipChallenge
