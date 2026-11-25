# ADR-0005: Private Single-User Milestone and Evolution Roadmap

- **Status:** Accepted
- **Date:** 2026-11-25
- **Related:** [Features & Capability Matrix](../FEATURES.md), [ADR-0001](0001-sqlite-outbox-with-rabbitmq.md), [ADR-0003](0003-s3-object-storage-with-seaweedfs-dev.md)

## Context

Echo's core value proposition is an audio-first personal note-taking pipeline: record or import audio, persist it reliably, transcribe it asynchronously, review and edit the transcript across sessions, and refine it into structured formats (`blog`, `interview`, `notes`, `news`).

Earlier planning documents mixed long-term multi-user SaaS aspirations (user accounts, OAuth, PostgreSQL, social publishing) with MVP capture and transcription features, creating ambiguity about what is safe to deploy today and what architectural boundaries actually exist.

## Decision

Explicitly bound the **current milestone** to **private, single-user deployment**, and treat multi-user exposure, playback, discovery, and authoring workflows as deliberate, sequenced roadmap phases.

### Current Milestone Boundaries (Explicit Non-Goals Today)

1. **No authentication or per-user ownership.** API routes (`/api/recordings/*`, `/api/recordings/{id}/refinements`) have no authentication middleware, and database entities have no `owner_id` / `user_id` column. Any caller able to reach the API can read, create, refine, or delete any recording.
2. **Private network exposure only.** Production deployments (`docker-compose.prod.yml`) omit host port bindings for the API and RabbitMQ by design and expect a private reverse proxy or VPN boundary (e.g., Tailscale, private ingress, or authenticated proxy) until application-level access control is added.
3. **No containerized web app service yet.** `apps/web` builds cleanly as a static Vite SPA (`pnpm build`), while local development proxies `/api` through Vite; production web hosting / reverse-proxy integration is deferred to the web deployment phase.
4. **Unpaginated recording list.** `GET /api/recordings` currently returns all recordings (including transcript text) and lets the client sort and filter by title/filename and status. This is adequate for a personal library of dozens to a few hundred notes, not for multi-tenant or large archives.

### Planned Evolution Path

Each planned capability builds directly on the current architecture without requiring a rewrite:

1. **Authentication Boundary & Web Deployment:**
   - Introduce user identity and an `owner_id` column on `recordings` (cascading ownership checks to transcription/refinement endpoints).
   - Add a production web container/static hosting configuration behind the same reverse proxy as `/api`, plus server-side pagination and slim summary DTOs for `GET /api/recordings`.
2. **Audio Playback & Title Editing:**
   - Extend `IFileStorage` with authenticated streaming or short-lived S3 presigned `GET` URLs so users can replay original audio alongside the transcript editor.
   - Add a `PATCH /api/recordings/{id}` endpoint and inline editor UI for `Recording.Title` (the nullable 200-char column already exists in `recordings`).
3. **Full-Text Search & Library Ergonomics:**
   - Move filtering from client-side title matching to server-side search across titles, edited transcripts, and refined outputs (via SQLite FTS5 while single-owner, or PostgreSQL `tsvector` after migration per [ADR-0001](0001-sqlite-outbox-with-rabbitmq.md)).
4. **Custom Refinement Guidance & Personal Blog Authoring Workflow:**
   - Allow optional per-request guidance (tone, audience, length) layered safely onto the system prompts while retaining `PromptVersion` tracking and `RefinementRequest` idempotency.
   - Expand the `blog` format into an iterative authoring/export workflow (frontmatter metadata, editable draft outputs, Markdown/static-site export).
5. **Local AI Providers:**
   - Implement and validate local transcription and chat refinement adapters in `apps/worker-ts` (e.g., local Whisper / Ollama / OpenAI-compatible local endpoints), preserving the existing `Transcriber` and `Refiner` interfaces and RabbitMQ job protocol so local and cloud providers remain swappable via configuration.

## Consequences

### Positive

- **Honest security posture.** Reviewers and operators immediately know that the current deployment must stay private and why.
- **High reliability before surface-area expansion.** Engineering effort focused first on durable uploads, transactional outbox dispatch, idempotent retries, and end-to-end tests rather than scaffolding half-built auth over a broken pipeline.
- **Incremental, low-risk roadmap.** Every planned phase extends existing abstractions (`IFileStorage`, `Transcriber`, `Refiner`, `Recording.Title`, vertical-slice endpoints) rather than replacing them.

### Negative and Trade-offs

- **Not safe for public internet exposure out of the box.** Anyone exposing port 8080 publicly without an authenticating proxy would expose both stored notes and paid OpenAI/OpenRouter API usage.
- **Retrofitting ownership requires a migration.** Existing single-user recordings will need a backfill to an initial owner account when authentication is introduced.
- **Client-side library scaling ceiling.** Fetching full `RecordingResponse` payloads on `GET /api/recordings` and per-recording refinement lists on `/outputs` will become slow once a library reaches hundreds of long transcripts, making pagination and slim list projections an early priority ahead of multi-user launch.
