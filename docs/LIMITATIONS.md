# Limitations

- **App-to-app VoIP only.** Saar does not work with, or claim support for, ordinary phone-network calls.
- **Final captions per utterance.** Partial (word-by-word) captions stream live; the authoritative, ordered caption that notes cite arrives ~0.7 s (silence window) + ~0.1–0.3 s processing after the speaker pauses.
- **Phone browsers in the background.** iOS/Android may suspend the microphone when the screen locks or the app is backgrounded. Saar pauses transcription and asks you to keep it open; it does not promise background transcription.
- **Loudspeaker echo** can make one phone transcribe the other person's voice. Browser echo cancellation, an earphones hint and an echo heuristic reduce this; the heuristic can only hide the later of two near-identical segments.
- **LLM spend is capped at $0.20** (configurable). When the cap is reached, notes fail gracefully and transcripts are kept.
- **Evaluation** uses Gnani-TTS synthetic speech (same vendor TTS→STT is likely optimistic) with simulated noise/telephony; n is small and confidence intervals are wide.
- **Notes can still be wrong.** Evidence citations and the faithfulness check make errors visible; they do not eliminate them. The number-word parser covers basic English/Hindi words only; ITN output (digits) is the main path.
- **Single instance.** In-memory room hub; one uvicorn worker.
- **Consent flow is a prototype**, not a compliance certification. Evon (Gnani's LLM) is not used because it is not on the API platform.
