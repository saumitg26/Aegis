# AEGIS

A calm workspace for documenting online incidents, preserving original records, reviewing possible connections, and preparing a local PDF. Built for **synthetic demonstrations only**.

React 19 + TypeScript + Vite frontend; FastAPI + SQLAlchemy backend. Local SQLite requires no cloud account. Plus Jakarta Sans is self-hosted. The project was built from an empty repository, guided by the supplied AEGIS brief.

## Public preview and privacy

Render runs with `PUBLIC_DEMO=true`. It serves fixed synthetic fixtures, never reads saved cases into the public preview, and rejects database downloads, uploads, edits, reports and paid provider requests. The preview has no real authentication: Google/Vultr/SAML login is unavailable and the demo visitor receives no access token. Do not use this build for private or real survivor records.

The full workflow is available locally on loopback only. Do not expose local mode to the internet. Real multi-user authentication, ownership checks, secure persistent storage and retention controls are still required before private deployment. Docker builds exclude local databases, artifacts and environment files.

Recording is local; a separate consent checkbox and explicit action are required to send audio to ElevenLabs. Failed transcription preserves the original clip and never substitutes invented speech. Incident dates stay unknown unless supplied by the user. Google extraction has its own explicit consent.

## Run locally

Requires Node 20.19+ (Node 24 tested), Python 3.11+ (3.12 tested).

```sh
npm ci
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.lock.txt
cp .env.example .env
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal, from the repository root:

```sh
npm run dev
```

Open http://127.0.0.1:5173. For local sample data, seed with:

```sh
curl -X POST http://127.0.0.1:8000/api/seed
```

Seeding is idempotent and never overwrites an existing case. Schema tables are created automatically; there is no migration framework yet. OpenAPI documentation: http://127.0.0.1:8000/docs.

## Working in this version

- Seven responsive screens, keyboard-visible focus, Radix dialogs with focus management, reduced-motion styles.
- Create/edit a single case; save timestamped incidents and notes.
- Import original bytes, calculate server-side SHA-256, inspect plain text and metadata, download originals, remove originals and derived events/findings.
- Search evidence and filter its source. Timeline merges parsed events and incidents, preserving unknown dates and converting timezone-aware dates to UTC.
- Deterministic cross-artifact connections: exact URLs, six-word overlap, and timestamps within ten minutes. Each suggestion lists its evidence and limitations. Up to 500 events per reconstruction.
- Accept/reject findings. Reports include only accepted suggestions with all supporting records selected.
- Select evidence, add an editable summary, redact exact phrases throughout report text, preview the same text used by PDF generation, download locally.
- Real server-side Gemini structured-analysis and Q&A adapters. User-selected evidence, separate Google consent, bounded input, evidence-ID validation and exact-quotation validation. Unconfigured services are explicitly unavailable.
- Local microphone capture and playback work without API keys in supported browsers. Stop, discard, and a 60-second cap are provided. Explicitly choose transcription with ElevenLabs after consent; edit the transcript before asking. ElevenLabs speech playback and the labeled fixed-checklist typed fallback remain available as configured.

## Supported imports

Maximum 10 MB per file. Text must be UTF-8.

- `.eml`: headers and plain-text MIME body; HTML is never rendered. Attached files inside emails are not extracted.
- `.json`: **only the documented normalized chat schema**, not arbitrary Discord/Slack export formats. See `fixtures/community-chat.json`:
  ```json
  {"platform":"Community forum","messages":[{"author":"demo","timestamp":"2026-10-15T14:35:00Z","content":"Synthetic message"}]}
  ```
  Up to 500 messages; timezone-less or invalid dates remain unknown.
- `.txt`: text event with unknown original time.
- `.png`, `.jpg`, `.jpeg`: signature-checked original bytes and metadata. No OCR, image preview, malware scan, or forensic authenticity claim.

The synthetic fixture includes an unrelated reminder near the other messages to demonstrate a timing false positive. Stable random evidence IDs are stored with their originals; hashes do not certify authenticity or legal admissibility.

## Provider setup

Set backend-only variables in `.env` and restart the API:

- `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`; change to a model available to your account).
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`; optional STT/TTS model IDs.

Never use `VITE_` variables for secrets. No real keys were supplied or committed. Adapters are covered with mocked transport responses; **live provider execution, microphone capture, and audio playback were not verified**. Missing-key and no-consent paths are tested. Providers may retain supplied content. Each operation requires explicit consent; browser microphone permission is a separate user action.

Gemini citation/quotation checks detect unknown IDs and non-matching quotation fields. They do not establish factual truth or guarantee that every free-form assertion is grounded; all output still needs human review. Keyless Q&A is deliberately a fixed checklist, not simulated AI.

## Verification

```sh
npm run build
npm test
.venv/bin/python -m pytest backend/tests -q
```

See `docs/QA.md` for actual checks. See `docs/DESIGN.md` for design references and the precise role of shadcn, Impeccable, Apple Design, and Chrome DevTools MCP. `.vscode/mcp.json` provides optional shadcn and Chrome DevTools servers; those MCPs were not invoked in this implementation session.

## Boundaries and next work

This is a functional local MVP, **not the entire production system described in the master brief**. Bind to loopback only. No authentication, encryption-at-rest, tenant isolation, request rate limiting, malware scanning, retention scheduler, or security review exists. Do not deploy this API publicly or upload real harassment evidence.

Current deliberate simplifications:

- One case stored as typed JSON records in SQLAlchemy, with application-managed deletion. No normalized multi-case relational model or database foreign-key cascades yet.
- An accessible connection list, not an interactive node graph. Six-word overlap is a simple signal, not a statistically validated distinctiveness metric.
- Incidents can be added but not edited/deleted in the UI; evidence labels are not editable. Timeline has no date/source filters yet.
- Reports include selected evidence events and a user-entered summary. Manually entered incidents must be summarized in the personal-summary field; individual incident selection is not implemented. Redaction is exact-text replacement, not field-level structured anonymization. Full-document editing is not implemented.
- PDF uses ReportLab's standard font; extended Unicode/script coverage needs a bundled Unicode font before use beyond the English synthetic fixtures.
- Voice shows the latest exchange, not a persistent conversation log. No server-side audio-duration verification; upload-byte limits are enforced.
- Errors/timeouts are handled; provider quotas are surfaced as service failures, not granular quota diagnostics. Supabase and live provider flows remain unverified.

`DATABASE_URL` can target PostgreSQL with an appropriate SQLAlchemy driver, for example `postgresql+psycopg://...` after installing `psycopg[binary]`. Supabase requires credentials, migrations, access controls and deployment validation; it is not preconfigured. Original bytes remain in `ARTIFACT_DIR` on the backend filesystem.

## Three-minute demonstration

1. **0:00–0:45:** Open Home, document a synthetic incident, then inspect the email original and its SHA-256 in Evidence.
2. **0:45–1:30:** Show UTC Timeline. In Insights inspect the shared URL/phrase, accept that suggestion, and reject the unrelated reminder's timing-only link. Explain that neither identifies a person.
3. **1:30–2:00:** With a configured Gemini key, select records and consent to analysis; review the cited suggestions. Without a key, show the explicit unavailable state and the deterministic local analysis.
4. **2:00–2:30:** With ElevenLabs configured, consent, record a short question, stop, edit transcript and confirm. Optionally consent to Gemini for the answer; explicitly prepare and play speech. Without keys, show the labeled typed-checklist fallback and state that live voice has not been verified.
5. **2:30–3:00:** Select report records, add context, redact an exact phrase, preview, and download the PDF. Nothing is shared automatically.

## Recording status

`Record locally` requests browser microphone permission and captures a clip on this device. `Stop recording` releases the microphone and provides local playback. No audio is uploaded by recording or stopping. `Discard recording`, navigation away, and unmount cancel capture. Local clips are ephemeral and are not added to the evidence store.

To transcribe, configure `ELEVENLABS_API_KEY`, restart the backend, reload the app, opt in to ElevenLabs processing, and choose `Transcribe with ElevenLabs`. Set `ELEVENLABS_VOICE_ID` for spoken replies, and `GEMINI_API_KEY` for AI answers. Live microphone hardware and provider round trips remain unverified; six frontend tests cover capture lifecycle using a simulated MediaRecorder, alongside eight backend tests. No key is required for the local recording UI or typed checklist.
