<div align="center">

# AEGIS
### Adaptive Evidence Graph & Incident System

**Your story. Your evidence. Your control.**

*A calm, voice-enabled companion for documenting online harassment, understanding possible patterns, and preparing evidence-linked reports.*

**Built for [Technica 2026](https://technica-2026.devpost.com/) · October 17–18, 2026**

[**Try the interactive demo**](https://aegis-hrt7.onrender.com/) · [**How it works**](#how-it-works) · [**Run locally**](#run-locally)

</div>

> **Hackathon prototype — synthetic data only.** AEGIS is not a production evidence vault, emergency service, legal adviser, or secure channel for real harassment records. Please use fictional data and sample files when trying the hosted demo.

## The problem

For someone experiencing online harassment, the hardest part of seeking support can be organizing what happened. A single experience may involve screenshots, emails, chat messages, different accounts, and dates scattered across platforms. The person affected should not need forensic expertise to make sense of those records.

This challenge can be especially relevant to women, nonbinary people, and other underrepresented members of technical communities who face barriers to participating safely online.

## Our solution

**AEGIS makes digital documentation more understandable and accessible.** It brings user-provided records into one workspace, reconstructs a readable timeline, surfaces *possible* connections between records, and lets the user decide what deserves to be included in an export.

Underneath the approachable interface is a Python forensic workflow, a Google Gemini explanation layer, and an optional ElevenLabs voice experience. AEGIS is designed to **support human judgment—not replace it**.

### What makes AEGIS different?

- **Evidence first:** store original uploaded bytes in the demo workspace, calculate a SHA-256 fingerprint, and keep source references attached to findings.
- **Observations are not accusations:** shared URLs, overlapping text, or close timestamps can suggest a relationship; they do **not** establish identity, intent, or coordinated behavior.
- **Human review:** suggested findings stay reviewable. Saving a possible pattern records the user's relevance decision, not independent verification.
- **Voice as an alternative:** document an experience by speaking, listen to explanations, or review a recording—without requiring voice to use the app.
- **Calm by design:** readable copy, clear next steps, muted teal-and-mint visuals, keyboard focus states, and reduced-motion support.

## Features

| Experience | What you can do |
| --- | --- |
| **Home** | Start with a guided overview and continue a case without navigating a security-style dashboard. |
| **My Case** | Give an investigation context, record incidents, and see documented moments. |
| **Evidence** | Import and inspect source records; view file metadata and fingerprints; search and filter uploads. |
| **Timeline** | Explore incidents and parsed communication events in chronological order, including records with unknown dates. |
| **Insights** | Review deterministic connections and, when configured, Gemini-assisted explanations linked to selected evidence. |
| **Voice Companion** | Tell your story, explore case information through speech or text, and review audio recordings using optional ElevenLabs processing. |
| **Reports** | Choose evidence, edit a summary, apply text redactions, preview, and download a PDF locally. |

### Voice Companion: three ways to interact

1. **Tell My Story:** capture a spoken account locally, review or edit the transcription, and turn it into an incident draft before saving.
2. **Review Recordings:** work with imported audio and, with ElevenLabs enabled and user consent, explore a timestamped transcript with speaker-turn labels.
3. **Explore My Case:** ask plain-English questions about selected evidence and optionally hear an answer spoken aloud.

Microphone access is requested by the browser. Recording itself should not require sending audio to an external provider; ElevenLabs transcription and speech generation are separate consent-based actions. Speaker labels do not verify who a person is.

### Digital forensics, without pretending certainty

AEGIS's deterministic correlation engine compares records from different artifacts for:

- **Matching URLs** across messages.
- **Shared six-word phrases** in textual evidence.
- **Close event timestamps** within a ten-minute window.

Results contain evidence IDs and explanatory signals. Timing-only links are deliberately treated as potential coincidences; the synthetic dataset includes an unrelated event to illustrate that false-positive risk. Uploaded hashes help detect later changes to file bytes, **not** authenticate their original source or guarantee legal admissibility.

## How it works

~~~mermaid
flowchart TD
    A["User-provided evidence or narrated incident"] --> B["AEGIS case workspace"]
    B --> C["Parse records + preserve original bytes and SHA-256"]
    C --> D["Chronological events and deterministic connections"]
    D --> E["Optional Gemini explanations with evidence IDs"]
    E --> F["Human review: save, dismiss, or revisit"]
    D --> F
    F --> G["Select and redact records"]
    G --> H["Preview and download PDF"]
    V["Optional ElevenLabs speech-to-text / text-to-speech"] <--> B
~~~

**Gemini** assists with structured summaries and question answering using selected records. The backend checks referenced evidence IDs and exact quotation fields where supplied. AI-generated interpretations still require human review.

**ElevenLabs** provides speech-to-text and text-to-speech integrations for the voice workflow. Availability depends on API configuration and provider access; the demo also provides clearly labeled non-AI or typed alternatives when applicable.

## Technica 2026 challenge alignment

AEGIS was designed for Technica's mission of empowering underrepresented genders in technology through inclusion, accessibility, safety, and user agency.

| Challenge / prize | How AEGIS relates |
| --- | --- |
| **[Cipher Tech] Best Digital Forensics Hack** | Original artifact preservation, hashes, message parsing, timeline reconstruction, and explainable cross-artifact correlation. |
| **[MLH] Best Use of Gemini API** | Structured, evidence-referenced incident explanations and case question answering. |
| **[MLH] Best Use of ElevenLabs** | Guided voice documentation, transcription, audio review, and spoken explanations. |
| **[Technica] A Sea for All: Best Accessibility Solution** | Optional voice interaction, keyboard-accessible workflows, readable language, and progressive disclosure. |
| **[Technica] Fin-tastic Design: Best UI/UX Hack** | A supportive and uncluttered experience rather than an intimidating surveillance interface. |

These are areas of relevance, **not claims of eligibility, submission to every category, or awards received**.

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Interface | Plus Jakarta Sans, Lucide React, Radix UI, GSAP, custom responsive CSS |
| Backend | Python, FastAPI, SQLAlchemy, Uvicorn |
| Local/demo storage | SQLite plus filesystem artifact storage |
| Forensics | Python standard-library email parsing, SHA-256 via `hashlib`, deterministic text/URL/time matching |
| AI | Google Gemini API via the Google Gen AI Python SDK |
| Voice | ElevenLabs speech-to-text (Scribe) and text-to-speech |
| Reporting | ReportLab PDF generation |
| Deployment | Docker on Render |

The current application does **not** depend on Supabase, a vector database, or live integrations with social-media platforms.

## Try the hosted demo

**[Open AEGIS →](https://aegis-hrt7.onrender.com/)**

The hosted Render configuration uses `PUBLIC_DEMO=true`. Choose **Try the interactive demo** to open a temporary guest workspace with sample content. You can practice documentation, inspect records, review suggested connections, explore the voice screen, and export a report.

**Important demo restrictions:**

- Use **fictional content only**. Do not upload actual private messages, recordings, credentials, or identifying details.
- Guest workspaces use separate temporary databases and artifact directories with session cookies. They are **not** production accounts.
- Temporary sessions expire after approximately **two hours** or a server restart; export anything you want to keep.
- Demo use and assisted AI operations have rate and capacity limits.
- Gemini and ElevenLabs actions require configured server-side keys, supported provider access, and explicit user consent.
- Render Free's local filesystem is not durable across restarts or redeployments.
- Experimental registration / OAuth-related features should not be treated as a security-certified identity system or a guarantee of encrypted permanent storage.

This is a single-instance demonstration. It has not undergone a production security assessment.

## Three-minute judge walkthrough

1. **Document (0:00–0:35):** Open the sample case and add a fictional incident in **My Case** or through the guided voice interface.
2. **Preserve (0:35–1:10):** Inspect an imported `.eml` or chat JSON in **Evidence**. Show its source details and SHA-256 fingerprint.
3. **Connect (1:10–1:45):** Open **Timeline** and **Insights**. Compare a matching phrase/URL with a timing-only false positive; review why the engine suggested each connection.
4. **Explain and listen (1:45–2:25):** If configured, run Gemini analysis on selected records and use ElevenLabs transcription or spoken playback. Make clear which portions depend on live external APIs.
5. **Take control (2:25–3:00):** Save a relevant finding, omit an uncertain one, redact private text, preview the final report, and download the PDF.

**The key moment:** AEGIS helps someone connect separate records while making the supporting evidence, uncertainty, and final user decision visible.

## Run locally

Requirements: **Node.js 20.19+**, **Python 3.11+**.

~~~bash
git clone https://github.com/saumitg26/Aegis.git
cd Aegis

npm ci
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.lock.txt

cp .env.example .env
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
~~~

In a second terminal, from the repository root:

~~~bash
npm run dev
~~~

Open **http://127.0.0.1:5173**. The FastAPI OpenAPI page is available at **http://127.0.0.1:8000/docs**.

To initialize local synthetic sample data:

~~~bash
curl -X POST http://127.0.0.1:8000/api/seed
~~~

### Optional AI and voice setup

Configure keys **on the backend only** in `.env`; never place them in `VITE_` variables or commit them.

~~~dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_STT_MODEL=scribe_v1
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2
~~~

Restart the backend after changing environment variables. Missing integrations should be disclosed in the UI rather than presented as successful real API operations.

### Evidence import formats

- `.eml` — email headers and plain-text MIME body.
- `.json` — normalized messages in the project's documented schema (see `fixtures/community-chat.json`), not arbitrary Discord/Slack exports.
- `.txt` — plain-text notes (no automatically inferred original timestamp).
- `.png`, `.jpg`, `.jpeg` — stored original image bytes and metadata; no OCR or authenticity assessment.
- Audio formats supported by the current importer, including `.wav`, for optional recording review.

Individual imports are limited to **10 MB**. Text files must be UTF-8; JSON is limited to the supported schema.

## Tests and project docs

~~~bash
npm run build
npm test
python -m pytest backend/tests -q
~~~

Read [the QA record](docs/QA.md) for previously documented checks and [design notes](docs/DESIGN.md) for implementation decisions. Passing tests does not prove production readiness or validate live third-party API availability.

## Responsible design and limitations

AEGIS is an **educational hackathon prototype**. It does not determine who controls an account, prove malicious intent, diagnose someone, or provide legal conclusions.

- **Human oversight:** model-generated observations and interpretations remain distinguishable from source records. Users choose which possible patterns to keep or omit.
- **Evidence integrity:** fingerprints are checks on stored bytes, not certificates of authenticity.
- **Privacy and consent:** voice/AI features may send selected content to external providers if the user opts in. Provider retention policies are outside AEGIS's control.
- **Storage:** the hosted demo is temporary. Persistent real-user storage, security auditing, robust authentication and authorization, retention/deletion guarantees, and sensitive-data handling need additional engineering.
- **Scope:** this is not a crisis-response service and should not replace professional, legal, or emergency support.
- **Honest failure states:** if an API fails, no generated or sample text should be presented as a transcript of a real recording.

## Development and acknowledgements

Built as a **Technica 2026 hackathon project**, with a focus on human-centered safety, accessible voice interaction, and transparent digital forensics.

Development involved AI-assisted planning and coding support; Gemini and ElevenLabs are also integrated as application services. Generated code and model output require developer validation and human review. Thanks to the open-source maintainers of React, FastAPI, Radix UI, GSAP, Lucide, and the other dependencies that make this prototype possible.

---

<div align="center">

**AEGIS — You are heard. Your information is organized. You are in control.**

[Launch the demo](https://aegis-hrt7.onrender.com/) · [Source code](https://github.com/saumitg26/Aegis)

</div>
