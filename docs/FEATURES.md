# Echo — Features & Capability Matrix

> **Status:** As-built reference  
> **Last updated:** 2026-11-25

Echo is an audio-first note-taking application. Record or import spoken audio, keep your recordings in a personal library, review and edit transcripts across sessions, and refine them with AI into structured formats (`blog`, `interview`, `notes`, or `news`).

For architectural rationale and message-queue contracts, see the [Architecture Decision Records](adr/README.md) and [Job Queue Protocol](JOB-QUEUE.md).

---

## Capability Matrix

| Capability | Status | Summary |
| --- | --- | --- |
| Audio capture & file import | **Live** | Browser microphone recording (`MediaRecorder`) with start/pause/resume/stop/discard, live level bars, 30-minute cap, and audio file import (up to 25 MB). |
| Resilient upload & S3 storage | **Live** | Magic-byte validation, UUID `Idempotency-Key` + SHA-256 deduplication, in-tab failure recovery (retry/download/discard), SeaweedFS S3 in dev, AWS S3 in prod. |
| Asynchronous transcription | **Live** | API-owned SQLite transactional outbox (`job_outbox`) → RabbitMQ → TypeScript worker (`OpenRouter` or `OpenAI`), bounded retries with backoff, manual retry endpoint. |
| Revisioned transcript editing | **Live** | Server-persisted edits with `TranscriptRevision` optimistic concurrency, undo/redo, reset to original, debounced auto-save, `localStorage` recovery draft, navigation guard. |
| AI refinement (4 formats) | **Live** | Async LLM refinement into **Blog Post**, **Interview**, **Notes**, or **News Brief** pinned to the saved transcript revision, with `RequestKey` replay deduplication and regeneration. |
| Output preview & export | **Live** | Formatted Markdown preview, word count, one-click clipboard copy, `.md` file download, and a Saved Outputs view across recordings. |
| Library & history | **Live** | Personal recording library with featured "continue reviewing" card, stage filter, client-side title/filename search, newest-first ordering, and permanent deletion. |
| Audio playback | **Planned** | Stream or replay the original uploaded audio inside the review screen via authenticated API streaming or short-lived S3 presigned URLs. |
| Title editing | **Planned** | API endpoint and UI to rename recordings (persisted to the existing `recordings.title` column). |
| Custom refinement guidance | **Planned** | Optional user instructions (tone, audience, length, emphasis) layered on top of the four base formats. |
| Full-text search & server pagination | **Planned** | Server-side search across titles, transcripts, and refined outputs, plus paginated slim list responses for `GET /api/recordings`. |
| Local AI providers | **Planned** | First-class validated local model adapters (e.g., local Whisper and local OpenAI-compatible chat servers) alongside OpenRouter and OpenAI. |
| Authentication & web deployment | **Planned** | User identity, per-user recording ownership, scoped queries/mutations, and production web hosting configuration. |
| Personal blog authoring workflow | **Planned** | Editable refined drafts, frontmatter metadata, and publishing-friendly Markdown export built on the `blog` output format. |

---

## Live Capabilities (As Built)

### 1. Audio Capture & File Import

Users start from `/record` (`apps/web/src/routes/record.tsx`) to either record live or import an existing recording:

- **Live recording:** Uses `navigator.mediaDevices.getUserMedia()` and `MediaRecorder` (`useAudioRecorder`) with start, pause, resume, stop, and discard controls.
- **Live feedback:** Displays real-time audio input level bars and an elapsed duration timer.
- **Safety cap:** Automatically stops and prepares upload at 30 minutes (`MAX_SECONDS = 1800`).
- **File import:** Accepts MP3, WAV, M4A, WebM, and OGG files up to 25 MB in the browser; the API additionally validates FLAC and MP4 audio containers (`AudioFileValidator`).
- **Tab-level recovery:** If an upload fails, the finalized audio remains in the current tab with **Retry upload** (reusing the same UUID `Idempotency-Key`), **Download audio**, and **Discard audio** actions, plus a navigation guard (`useBlocker` / `beforeunload`) to prevent accidental loss.

### 2. Upload & S3 Object Storage

Uploads target `POST /api/recordings` (`CreateRecording.cs`):

- **Validation:** Rejects empty files, files over 25 MB, unsupported MIME types, and files whose leading magic bytes do not match their declared container (`WebM`, `MP4/M4A`, `MP3`, `WAV`, `FLAC`, `OGG`).
- **Idempotency:** Requires a UUID `Idempotency-Key` header stored in unique-indexed `recordings.upload_key` alongside a composite SHA-256 hash (`UploadHash`) of audio bytes, filename, and normalized content type. Replaying the same key with the same audio returns `200 OK`; reusing it with different audio returns `409 Conflict`.
- **Object storage:** Stores audio behind `IFileStorage` under `recordings/<recordingId>/<guid><ext>` (SeaweedFS `weed mini` locally via `docker-compose.override.yml`; AWS S3 in production via `docker-compose.prod.yml`). If SQLite commit fails after upload, the API performs best-effort S3 cleanup.
- **Deletion:** `DELETE /api/recordings/{id}` removes the S3 object before deleting the SQLite recording (cascading to transcription jobs, refinement jobs, and refinement requests) and clears browser recovery drafts.

### 3. Asynchronous Transcription

Transcription runs outside HTTP request lifecycles:

- **Single-owner SQLite + Outbox:** `CreateRecording` commits a `Recording` (`pending`) and `TranscriptionJob` (`created`). `RabbitJobService` atomically marks due jobs `processing` (`Recording.Status = transcribing`), generates a `ClaimToken`, writes to `job_outbox`, and publishes persistent messages to `echo.jobs` with publisher confirms.
- **Stateless TypeScript worker:** `apps/worker-ts` consumes `echo.jobs` with `prefetch(1)`, downloads the S3 object to a private temporary file (`0o600`), invokes the configured provider (`OpenRouterTranscriber` defaulting to `openai/gpt-4o-mini-transcribe`, or `OpenAITranscriber` using `gpt-4o-transcribe`), cleans up the temporary file, publishes a confirmed result to `echo.results`, and acknowledges the job.
- **Bounded retries & manual recovery:** Transient worker errors receive one delayed nack/requeue per delivery; retryable failure results are rescheduled by the API with backoff (`5s`, `10s`) up to 3 dispatch attempts before marking the recording `failed`. Users can explicitly retry failed transcriptions via `POST /api/recordings/{id}/retry` with `ExpectedRetryCount`.
- **Progress tracking:** The review page (`/recordings/$recordingId`) polls every 3 seconds while a recording is `pending` or `transcribing`.

### 4. Revisioned Transcript Editing

Once transcribed, `/recordings/$recordingId` renders `TranscriptEditor`:

- **Server-persisted edits:** Debounced auto-save (500 ms) writes to `PUT /api/recordings/{id}/transcript` with `{ Text, ExpectedRevision }` (max 200,000 characters).
- **Optimistic concurrency:** `Recording.TranscriptRevision` is an EF Core concurrency token. Conflicting edits from another session return `409 Conflict`, while lost-response replays of an already-applied edit succeed idempotently.
- **Editor features:** Up to 100-step undo/redo (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`) with 600 ms coalescing, **Reset to original** (restores `transcribedText`), live word and character counts, and `localStorage` draft backup keyed by revision.
- **Safe navigation:** Leaving the page flushes pending edits and blocks navigation if a save fails or conflicts.

### 5. AI Refinement (4 Formats)

From `/recordings/$recordingId/refine`, users transform the saved transcript revision into structured Markdown via `POST /api/recordings/{recordingId}/refinements`:

| Format | Key | Purpose |
| --- | --- | --- |
| **Blog Post** | `blog` | Structured article with introduction, headings, and conclusion preserving the author's voice. |
| **Interview** | `interview` | Readable dialog preserving explicit speaker labels without inventing identities or quotations. |
| **Notes** | `notes` | Concise topic-organized notes with headings, bullets, decisions, uncertainties, and action items. |
| **News Brief** | `news` | Factual summary leading with key information, supporting details, and attribution. |

- **Provider adapter:** `ChatRefiner` (`apps/worker-ts/src/refinement/refiner.ts`) calls OpenAI-compatible `/chat/completions` using the configured provider credentials (`REFINEMENT_MODEL` defaults to `openai/gpt-4.1-mini` on OpenRouter or `gpt-4.1-mini` on OpenAI; overridable with `REFINEMENT_MODEL` and `REFINEMENT_BASE_URL`). System prompts treat transcripts as untrusted source text to resist prompt injection and track `PROMPT_VERSION`.
- **Revision pinning & deduplication:** Refinement jobs capture a `SourceText` snapshot at `ExpectedRevision`. `RefinementRequest` deduplicates replays by `(recordingId, requestKey)` and reuses active or completed outputs for the same `(recordingId, transcriptRevision, format)` unless `regenerate: true` is requested.
- **Automatic staleness isolation:** `GET /api/recordings/{recordingId}/refinements` returns only jobs matching the recording's current `TranscriptRevision`, so editing a transcript hides older outputs from the active view.

### 6. Output Preview & Export

- **Formatted preview:** Renders Markdown output in `OutputRenderer` with word count and saved-status metadata.
- **Export actions:** One-click **Copy** to clipboard, **Download `.md`** (`<base>-<format>.md`), and **Regenerate** to create a fresh variation for the same format and revision.
- **Saved Outputs view (`/outputs`):** Aggregates completed outputs for current transcript revisions across recordings (paged in client-side batches of 20 recordings) with direct links back to each refined piece.

### 7. Library, History & System Info

- **Home library (`/`):** Displays a "Pick up where you left off" card for the newest transcribed recording, stage filter (`all`, `transcribed`, `pending`, `transcribing`, `failed`), client-side search by title/filename, newest-first ordering, and file size/stage metadata.
- **About page (`/settings`):** Informational view summarizing live pipeline stages and server-side persistence.

---

## Planned Roadmap

These capabilities are intentionally outside the current private single-user milestone (see [ADR-0005](adr/0005-private-deployment-and-evolution-roadmap.md)):

- **Audio Playback:** Replay the stored source audio in the browser while reviewing or editing a transcript.
- **Title Editing:** Rename recordings via API and inline UI instead of defaulting to the uploaded filename.
- **Custom Refinement Guidance:** Supply per-request instructions (tone, audience, length, structure) while keeping prompt versioning and replay safety.
- **Full-Text Search & Server-Side Pagination:** Search across transcript text and refined outputs on the server, and return paginated summary DTOs from `GET /api/recordings` without shipping every full transcript body.
- **Local AI Providers:** First-class support and automated verification for local speech-to-text and chat models alongside cloud providers.
- **Authentication & Web Deployment:** User accounts, per-user ownership enforcement across all API routes, and a production web deployment topology before exposing Echo beyond a private network.
- **Personal Blog Authoring Workflow:** Iterative editing, metadata/frontmatter support, and streamlined export from refined `blog` outputs.

---

## Data Model (As Built)

The API owns SQLite (`apps/api/Echo.API/Database/EchoDbContext.cs`) with snake_case table/column names, time-ordered UUIDv7 primary keys (`Guid.CreateVersion7()`), and lowercase string enums:

```text
recordings
├── id (PK, UUIDv7)
├── title (nullable, max 200)
├── status (pending | transcribing | transcribed | failed)
├── file_name, file_size_bytes, content_type, storage_key
├── transcribed_text, edited_text
├── transcript_revision (optimistic concurrency token)
├── upload_key (unique, max 36), upload_hash (SHA-256)
└── created_at, updated_at

transcription_jobs (1:1 with recordings, cascade delete)
├── id (PK, UUIDv7), recording_id (unique FK → recordings)
├── status (created | processing | completed | failed)
├── retry_count, attempt_count, claim_token, next_attempt_at, failure_reason
└── created_at, updated_at

refinement_jobs (N:1 with recordings, cascade delete)
├── id (PK, UUIDv7), recording_id (FK → recordings)
├── request_key (unique with recording_id), format (blog | interview | notes | news)
├── transcript_revision, source_text
├── status (created | processing | completed | failed)
├── content, model, provider, prompt_version, failure_reason
├── claim_token, attempt_count, next_attempt_at
└── created_at, updated_at

refinement_requests (replay map, cascade delete with refinement_jobs)
├── (recording_id, request_key) (composite PK)
├── job_id (FK → refinement_jobs)
└── format, transcript_revision, regenerate

job_outbox (API transactional outbox)
├── id (PK, UUIDv7)
├── payload (serialized JobMessage JSON)
└── created_at
```
