# Echo — Features Document

> **Version:** 1.0  
> **Last updated:** February 28, 2026  
> **Status:** Planning

---

## Overview

Echo transforms spoken audio into polished, structured text. This document describes each feature area of the application, how it works, and the technical approach behind it.

---

## F1: Audio Capture

### Description

Audio capture is the entry point of the Echo pipeline. Users can either record audio live in the browser or import a pre-recorded file. Think of this as the "input stage" — similar to how a file upload endpoint receives raw data before any processing happens.

### Capabilities

- **Live recording** via the browser's MediaRecorder API with start, pause, resume, and stop controls
- **File import** supporting common audio formats: MP3, WAV, M4A, WebM, OGG
- **Waveform visualization** during recording so users can confirm audio is being captured
- **Recording timer** displaying elapsed duration in real time
- **Max duration** of 30 minutes for MVP (extensible in future releases)
- **Audio quality target** of 16kHz+ sample rate for optimal transcription accuracy

### Technical Approach

The frontend uses the `navigator.mediaDevices.getUserMedia()` API to access the microphone and pipes the stream into a `MediaRecorder` instance. Audio chunks are accumulated in memory as `Blob` segments and merged into a single file on stop. For file imports, a standard file input accepts the supported MIME types and validates format/size before proceeding.

### Acceptance Criteria

- [ ] User can start, pause, resume, and stop a recording
- [ ] User can import an audio file from their device
- [ ] A waveform or level indicator is visible during recording
- [ ] Unsupported file formats show a clear error message
- [ ] Files over the size limit are rejected with guidance

---

## F2: Audio Transcription

### Description

Transcription converts captured audio into raw text using OpenAI Whisper. The processing happens entirely on the server side — the client uploads the audio, the server calls Whisper, and the result comes back as plain text. If you're familiar with C# backend patterns, this is like a controller action that receives a file, delegates to an external service, and returns the result.

### Capabilities

- **OpenAI Whisper API** integration for speech-to-text conversion
- **Server-side processing** via TanStack Start server functions (API keys never exposed to the client)
- **Multipart upload** using multer-style file handling on the backend
- **Progress indication** with status updates: uploading → processing → complete
- **Language detection** — English primary, with Whisper's automatic detection for other languages
- **Error recovery** with clear messages if transcription fails (network, timeout, bad audio)

### Technical Approach

A TanStack Start server function receives the audio blob as multipart form data. The server function forwards the file to the OpenAI Whisper API endpoint, awaits the response, and returns the transcribed text to the client. Environment variables for the API key are managed via T3Env and only accessible server-side.

### Acceptance Criteria

- [ ] Audio is uploaded and transcribed without exposing API keys to the browser
- [ ] User sees a progress indicator during transcription
- [ ] Transcription completes in under 3 minutes for 10-minute audio
- [ ] Failed transcriptions show a user-friendly error with retry option
- [ ] Transcribed text appears in the review editor

---

## F3: Transcript Review & Editing

### Description

After transcription, users can review and edit the raw text before AI refinement. This is the "quality gate" — like a code review step in a CI/CD pipeline where you inspect the output and fix issues before promoting it to the next stage.

### Capabilities

- **Editable text area** displaying the full transcript
- **Undo/redo** support for standard editing workflows
- **Auto-save** to prevent data loss (debounced writes to local state or database)
- **Character/word count** for content awareness
- **Clear CTA** to proceed to format selection once review is complete

### Technical Approach

The review screen renders the transcript in a controlled `<textarea>` or rich text component. Edit state is managed in React state with optional persistence to the database via a server function if the user is authenticated. Navigation guards warn users about unsaved changes.

### Acceptance Criteria

- [ ] Transcript is fully editable after transcription completes
- [ ] Undo and redo work correctly
- [ ] Edits persist if the user navigates away and returns (authenticated users)
- [ ] User can proceed to format selection from this screen

---

## F4: AI Refinement

### Description

AI refinement is Echo's core differentiator. It takes the reviewed transcript and transforms it into a polished output based on the user's chosen format. This is powered by Anthropic Claude, with each format using a specialized system prompt — similar to how you'd configure different middleware behaviors based on a route parameter or strategy pattern in C#.

### Capabilities

- **Four output formats** with distinct AI behavior:

| Format | What it does | AI behavior |
|--------|-------------|-------------|
| **Blog Post** | Structures content as a publishable article with intro, body, and conclusion | Adds transitions, headings, improves flow; preserves the author's voice |
| **Interview** | Formats as dialog/Q&A preserving each speaker's personality | Identifies speakers, removes filler words, structures as exchange |
| **Notes** | Clean, organized capture of key points | Removes verbal noise, organizes by topic, adds minimal structure |
| **News Brief** | Factual summary with clear highlights | Extracts key facts, uses inverted pyramid, adds bullet summaries |

- **Format selection UI** — card-based picker with descriptions and icons
- **Processing indicator** while Claude generates the output
- **Re-processing** — users can switch formats and re-run refinement on the same transcript

### Technical Approach

A server function receives the transcript text and selected format type. It constructs the appropriate system prompt for Claude based on the format, sends the request to the Anthropic API, and streams or returns the refined output. Each format has a dedicated prompt template stored server-side.

### Acceptance Criteria

- [ ] User can select from four output formats
- [ ] AI refinement produces well-structured output matching the selected format
- [ ] Processing completes within a reasonable time (< 30 seconds for typical transcripts)
- [ ] User can re-process with a different format without re-transcribing
- [ ] API errors are handled gracefully with retry option

---

## F5: Output & Export

### Description

The final stage presents the polished text and gives users multiple ways to use it — copy, download, or go back and re-process with a different format.

### Capabilities

- **Formatted preview** displaying the refined output with appropriate styling (headings, paragraphs, bullet points depending on format)
- **Copy to clipboard** — one-click copy of the final text
- **Download** as `.txt` or `.md` file
- **Re-process** — return to format selection to try a different output type
- **Share** (future) — direct publishing to connected platforms

### Acceptance Criteria

- [ ] Final output renders with correct formatting for the selected type
- [ ] Copy button copies text to clipboard and shows confirmation
- [ ] Download produces a valid text or Markdown file
- [ ] Re-process navigates back to format selection with the transcript preserved

---

## F6: Authentication

### Description

Authentication enables personalized experiences — saved recordings, transcript history, and preferences. Echo uses Better Auth, which can run stateless for quick setup or database-backed with PostgreSQL for full persistence.

### Capabilities

- **Email/password** sign-up and login
- **Session management** with secure, HTTP-only cookies
- **Protected routes** — recording, transcript, and output screens require authentication
- **Guest mode** (future) — limited usage without an account
- **OAuth** (future) — Google and GitHub social login

### Technical Approach

Better Auth is configured in `src/lib/auth.ts`. In stateless mode, it works without a database for rapid prototyping. Once PostgreSQL is connected, sessions and user records are persisted via Drizzle ORM. Route guards on protected pages check session validity and redirect to login if needed.

### Acceptance Criteria

- [ ] Users can sign up with email and password
- [ ] Users can log in and maintain a session
- [ ] Protected routes redirect unauthenticated users to login
- [ ] Session cookies are secure and HTTP-only

---

## F7: Dashboard & History

### Description

The dashboard is the landing page for authenticated users, showing their recent recordings and transcriptions, and providing a quick path to start a new one.

### Capabilities

- **Recent recordings list** with title, date, duration, and status
- **Quick actions** — continue editing, view output, or delete
- **New recording CTA** — prominent button to start the capture workflow
- **Search/filter** (future) — find past recordings by keyword or date

### Technical Approach

The dashboard route uses a TanStack Router loader to fetch the user's recordings from PostgreSQL via Drizzle. Each recording entry links to the appropriate step in the workflow based on its current status (transcribed, reviewed, refined).

### Acceptance Criteria

- [ ] Authenticated users see their recent recordings on the dashboard
- [ ] Each recording shows its current status in the pipeline
- [ ] Users can resume a recording at the step where they left off
- [ ] New recording button navigates to the capture screen

---

## F8: Data Persistence

### Description

Data persistence stores recordings, transcripts, and outputs so users can return to their work across sessions. This layer is optional for MVP (the app works without a database in stateless mode) but required for the full experience.

### Capabilities

- **PostgreSQL** database via Drizzle ORM with type-safe queries
- **Core entities:** User, Recording, Transcript, Output
- **Relationship model:** User → many Recordings → one Transcript → many Outputs
- **Migration management** via Better Auth CLI and Drizzle Kit

### Data Model

```
User
├── id (primary key)
├── email
├── name
└── createdAt

Recording
├── id (primary key)
├── userId (foreign key → User)
├── audioUrl
├── duration
├── status (recorded | transcribed | reviewed | refined)
└── createdAt

Transcript
├── id (primary key)
├── recordingId (foreign key → Recording)
├── rawText
├── editedText
└── status (draft | reviewed)

Output
├── id (primary key)
├── transcriptId (foreign key → Transcript)
├── format (blog | interview | notes | news)
├── content
└── createdAt
```

### Acceptance Criteria

- [ ] Database schema is created via migrations
- [ ] CRUD operations work for all core entities
- [ ] Data relationships are enforced at the database level
- [ ] The app functions in stateless mode when no database is configured

---

## Feature Priority Matrix

| Feature | Priority | Milestone | Complexity |
|---------|----------|-----------|------------|
| F1: Audio Capture | Must Have | M2 | Medium |
| F2: Transcription | Must Have | M3 | Medium |
| F3: Review & Editing | Must Have | M3 | Low |
| F4: AI Refinement | Must Have | M4 | High |
| F5: Output & Export | Must Have | M5 | Low |
| F6: Authentication | Must Have | M1 | Medium |
| F7: Dashboard & History | Should Have | M5 | Medium |
| F8: Data Persistence | Should Have | M1 | Medium |
