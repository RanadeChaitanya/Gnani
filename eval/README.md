# Evaluation

Honest, reproducible measurements of Gnani Prisma STT + this pipeline under telephony-style degradation, and how ASR errors propagate into notes.

```bash
python eval/make_audio.py              # Gnani Timbre TTS → eval/audio/<dialogue>/<turn>.wav (16 kHz, cached)
python eval/run_eval.py --plan         # audio minutes per experiment, no API calls
python eval/run_eval.py                # runs if within EVAL_MAX_AUDIO_SECONDS; otherwise add --yes or shrink:
python eval/run_eval.py --dialogues 6 --e1 clean,telephone,babble_10dB,babble_0dB
python eval/report.py                  # results/charts/*.png + results/report.md
```

- **Dataset**: `dialogues/*.yaml` — 9 fictional two-speaker dialogues (kirana order, clinic appointment, service complaint) × (Hinglish, Hinglish + Marathi, Hindi), numbers written as spoken words, with `gold_facts` / `gold_actions`. Each speaker has their own TTS voice (Poorvi for Hinglish, Ishaan/Zahira for Marathi, Nalini/Deepak for Hindi, Pranav for English).
- **Degradations** (`degrade.py`, seeded, deterministic): telephone band (300–3,400 Hz → 8 kHz → µ-law), white / pink / babble (other TTS voices) / synthetic street noise at 20/10/5/0 dB SNR, packet loss 5/10/20 %, combinations, and a spectral-gate stand-in for browser noise suppression.
- **E1** WER/CER per condition and language (REST, `verbatim` so references in spoken form compare fairly).
- **E2** VAD presets (threshold 0.5/0.7 × min-silence 500/700/900 ms) over the realtime WebSocket at real-time pace: WER, segments per sentence (fragmentation), Gnani latency.
- **E4** notes from degraded transcripts (`transcribe` format, as in the app): gold-fact recall, hallucination rate, and precision/recall of the app's faithfulness flags against actual errors.
- **Credits**: `--plan` prints the cost; the runner refuses to exceed `EVAL_MAX_AUDIO_SECONDS` without `--yes`; every (clip, config) result is cached in `eval/cache/` so re-runs are free. `results/usage.json` records audio actually sent.
- **Cut** (spec §16.9): E3 (word boosting, ITN format) and E5 (REST vs WS).

Only synthetic audio is written here (`eval/audio/`, gitignored). Limitations are listed in the generated report.
