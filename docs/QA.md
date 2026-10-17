# Verification record — October 17, 2026

- `npm run build`: TypeScript and Vite production build passed.
- `npm install`: 99 packages audited, 0 vulnerabilities reported at installation time.
- `.venv/bin/python -m pytest backend/tests -q`: 8 tests passed. One upstream Starlette/httpx deprecation warning; no failing tests.
- Tested API journey: seed, UTC ordering, hash equality against downloaded originals, incident save, finding review, report inclusion/exclusion, redaction, PDF signature, cascading artifact removal.
- Tested invalid JSON, unsupported extension, empty upload, invalid image signature, filename normalization, and unknown timestamps. HTML-like source text remains data.
- Tested provider consent/missing-key behavior, typed fallback, Gemini reference/quotation rejection, and mocked Gemini/ElevenLabs adapter responses. Mock tests are not live integration verification.
- Browser: inspected Home at 1440px and 390px; mobile document width and scroll width both 390px. Saved a synthetic incident from the mobile dialog and confirmed it on My Case. Tested evidence search, inspected chronological timeline, accepted a connection, generated its report preview, and verified the labeled typed-companion fallback.
- Core contrast ratios: primary #203536 on white 12.93:1; secondary #586F6D on white 5.37:1; secondary on #F8FAF9 5.12:1; white on #397F7C 4.67:1. These are token checks, not a full WCAG audit.
- Not verified: live API keys, microphone/audio round trip, Supabase, complete screen-reader audit, every viewport/browser, Unicode PDF glyphs, production security.

The preview uses seeded synthetic records. Local preview runtime data is ignored by Git.
