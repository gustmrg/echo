# ADR-0004: Idempotency, Claim Tokens, and Optimistic Concurrency

- **Status:** Accepted
- **Date:** 2026-11-25
- **Related:** [Job Queue Protocol](../JOB-QUEUE.md), [ADR-0001](0001-sqlite-outbox-with-rabbitmq.md), [Features & Capability Matrix](../FEATURES.md)

## Context

Echo's user workflow spans flaky browser networks, multi-second AI provider calls, at-least-once RabbitMQ deliveries, and multi-tab or cross-session transcript editing. Without explicit reliability primitives, common real-world failures cause costly or confusing corruption:

- Retrying a failed or timed-out audio upload creates duplicate recordings and pays twice for transcription.
- Two browser tabs editing the same transcript silently overwrite each other's changes.
- Retrying a refinement click (or double-submitting) queues duplicate LLM calls, or displays outputs generated from an older version of the transcript.
- A delayed or redelivered RabbitMQ result from an earlier attempt overwrites a newer retry or resurrects a deleted recording.

Rather than relying on best-effort UI debouncing alone, Echo enforces each invariant at the API and database boundary.

## Decision

Implement five concrete, database-backed reliability primitives across the upload, edit, retry, refinement, and job-result paths:

### 1. Upload Idempotency (`Idempotency-Key` + Composite SHA-256 Hash)

- `POST /api/recordings` (`CreateRecording.cs`) requires a UUID `Idempotency-Key` header, persisted in `recordings.upload_key` with a unique index.
- Before uploading to S3, the API hashes the stream and computes a composite SHA-256 digest (`UploadHash`) over `{SHA256(audioBytes)}\n{fileName}\n{normalizedContentType}`.
- If `upload_key` already exists:
  - Matching `UploadHash` returns `200 OK` with the existing `RecordingResponse` (safe retry replay).
  - Different `UploadHash` returns `409 Conflict` (`"This upload key was already used for different audio."`).
- If two concurrent requests with the same `Idempotency-Key` race past the initial lookup, the loser hits the unique index on `SaveChangesAsync`, deletes its orphaned S3 object, clears the EF change tracker, re-reads the winning row, and applies the same `200 OK` / `409 Conflict` replay rule.
- On the client (`apps/web/src/routes/record.tsx`), each finalized recording or imported file receives one `crypto.randomUUID()` retained in memory until upload succeeds or the user discards it, enabling safe retries without duplicating recordings.

### 2. Transcript Optimistic Concurrency (`TranscriptRevision`)

- `Recording.TranscriptRevision` is configured as an EF Core concurrency token (`.IsConcurrencyToken()`). It starts at `0`, increments to `1` when transcription completes, and increments on every substantive edit.
- `PUT /api/recordings/{id}/transcript` (`SaveTranscript.cs`) requires `{ Text, ExpectedRevision }`:
  - If `TranscriptRevision != ExpectedRevision`, the API first checks for a **lost-response replay** (`EditedText == request.Text && TranscriptRevision == ExpectedRevision + 1`) and returns `200 OK` idempotently; otherwise it returns `409 Conflict`.
  - Simultaneous updates that pass the initial check fail at commit with `DbUpdateConcurrencyException`, which maps cleanly to `409 Conflict`.
- On the client (`TranscriptEditor.tsx` + `TranscriptSession`), saves debounce (500 ms), mirror drafts to `localStorage` tagged with the revision for crash recovery, flush before route navigation (`useBlocker`), and block leaving if a conflict or network failure occurs.

### 3. Refinement Replay Deduplication (`RefinementRequest`) & Revision Pinning

- `POST /api/recordings/{recordingId}/refinements` (`CreateRefinement.cs`) requires `{ Format, ExpectedRevision, RequestKey, Regenerate }`.
- Requests whose `ExpectedRevision` does not match the recording's current `TranscriptRevision` (or for non-`transcribed` recordings) fail with `409 Conflict`, guaranteeing every output is pinned to an exact saved transcript snapshot (`SourceText` is copied onto `RefinementJob`).
- `refinement_requests` stores a composite primary key `(recording_id, request_key)` mapped to `job_id`, along with `(format, transcript_revision, regenerate)`:
  - Replaying the same `(recordingId, requestKey)` with identical parameters returns `202 Accepted` with the original `RefinementJob`—even if that request reused an existing cached or in-flight job.
  - Reusing a `RequestKey` with different parameters returns `409 Conflict`.
- For a new `RequestKey`, the handler reuses any existing `Created` or `Processing` job (or `Completed` job when `Regenerate` is `false`) for the same `(recordingId, expectedRevision, format)` and links the new `RefinementRequest` to it.
- `GET /api/recordings/{recordingId}/refinements` (`GetRefinements.cs`) filters strictly by `j.TranscriptRevision == recording.TranscriptRevision`, so editing a transcript immediately hides outdated outputs from the current view without deleting historical job rows.

### 4. Stale-Result Protection (`ClaimToken`)

- Every time `JobDispatch.Prepare` moves a `TranscriptionJob` or `RefinementJob` from `created` to `processing`, it assigns a brand-new `Guid` `ClaimToken` and embeds it in the RabbitMQ `JobMessage`.
- The worker echoes `job_id`, `claim_token`, and `kind` on every `JobResult`.
- `JobDispatch.Apply` verifies `job is not null && job.Status == JobStatus.Processing && job.ClaimToken == result.ClaimToken` inside a SQLite transaction before mutating state, then clears `ClaimToken = null`.
- Any duplicate delivery, delayed result from a superseded attempt, or result for a deleted recording is safely ignored and acknowledged on RabbitMQ.

### 5. Reviewed-Attempt Retry Guard (`ExpectedRetryCount`)

- `POST /api/recordings/{id}/retry` (`RetryTranscription.cs`) requires `{ ExpectedRetryCount }`.
- If the recording is already `Pending` or `Transcribing`, it returns `202 Accepted` idempotently.
- Otherwise it requires `RecordingStatus.Failed`, `JobStatus.Failed`, and `job.RetryCount == request.ExpectedRetryCount` (returning `409 Conflict` on mismatch) before resetting `Status = Created`, `AttemptCount = 0`, `ClaimToken = null`, and `NextAttemptAt = null`.

## Consequences

### Positive

- **Safe at-least-once messaging.** RabbitMQ redeliveries, worker restarts, and outbox publish-before-delete crashes cannot corrupt recording or refinement state.
- **No accidental duplicate AI spend on retries.** Network retries for uploads and refinements resolve to existing jobs rather than queuing redundant transcription or LLM requests.
- **Truthful revision lineage.** Users never mistake an AI output generated from an older draft for one matching their latest edited transcript.

### Negative and Trade-offs

- **Slightly richer client contracts.** Callers must track and send `Idempotency-Key`, `ExpectedRevision`, `RequestKey`, and `ExpectedRetryCount` instead of fire-and-forget `POST`/`PUT` payloads.
- **At-least-once provider execution still possible.** While database state is idempotent, a worker crash *after* calling OpenRouter/OpenAI and *before* confirming the RabbitMQ result can still trigger a second external API call upon redelivery. Additionally, combining 1 worker-level transient redelivery with 3 API dispatch attempts allows up to 6 external provider calls before automatic retries exhaust.
- **Unbounded `refinement_requests` and historical `refinement_jobs` retention.** Historical revisions and request keys are kept until the parent recording is deleted (`OnDelete(DeleteBehavior.Cascade)`). At high scale, a retention policy or pruning job would be needed.

## Verification

These invariants are exercised by automated API tests (`apps/api/Echo.API.Tests`), worker unit/integration tests (`apps/worker-ts`), and Playwright E2E tests (`apps/web/e2e`) covering upload recovery, durable revisioned editing, refinement deduplication, stale/duplicate results, and bounded retries.
