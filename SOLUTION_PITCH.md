# Saar: Solution Pitch

**Problem**
- Kirana stores order from many distributors by phone.
- Quantities, rates and dates live only in the call or scattered diaries.
- Disputes have no record to check.

**Solution**
- Consent-first calling app; both sides agree before transcription.
- Live captions by **Gnani Prisma v3.0** with per-segment language detection (Hindi, Marathi, English).
- LLM writes a structured order record; totals computed in code.
- Every number is checked against the transcript; both sides confirm.

**Outputs**
- Running record per distributor, with rate history.
- One Excel-ready sheet for all distributors.
- WhatsApp draft in the distributor's own language.

**Trust**
- Voice never stored; server text deleted after 24 hours.

**Measured:** 94–97% item accuracy on grocery orders (synthetic test).

**Next:** native phone-call integration through a consented telephony bridge.
