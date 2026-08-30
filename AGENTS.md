# Repository Instructions

## Back-End Patterns (API — C# / ASP.NET Core)

### Vertical Slice Architecture
Each feature lives under `Features/<FeatureName>/` with its own endpoint registrations, handlers, and response DTOs. There are no shared service or repository layers — handlers depend directly on `EchoDbContext` and `IFileStorage`.

### Minimal API Endpoints
- Endpoints are registered as static extension methods on `IEndpointRouteBuilder` (e.g., `RecordingEndpoints.MapRecordings`).
- Each HTTP operation is a separate class with a static `Handle` method that receives its dependencies via parameter injection.
- `Program.cs` only calls `AddInfrastructure`, maps endpoints, and applies migrations — no controllers.

### Database
- EF Core with SQLite, configured with snake_case column naming.
- Enums are stored as lowercase strings via `HasConversion`.
- Migrations are applied automatically on startup via `ApplyMigrationsAsync`.
- IDs use `Guid.CreateVersion7()` (time-ordered UUIDs).

### File Storage
- `IFileStorage` abstracts upload/download/delete operations.
- Local development uses the filesystem; production uses AWS S3.
- File keys are structured by context and identifier (e.g., `recordings/<id>/<filename>`).

## Back-End Patterns (Worker — TypeScript / Node.js)

### Poll-Based Job Processing
- The worker runs a continuous loop that polls SQLite for pending `TranscriptionJob` rows.
- Graceful shutdown uses an `AbortSignal` triggered by SIGINT/SIGTERM.
- On each iteration: atomically claim the next job → open audio from local/S3 storage → transcribe → atomically update job and recording status.
- Interrupted processing jobs remain leased and are reclaimed after `PROCESSING_LEASE_MS`.

### Source Layout
- `src/config` — validates environment variables into a typed configuration.
- `src/db` — raw SQL through Node's built-in SQLite client.
- `src/storage` — local filesystem and AWS S3 streaming readers.
- `src/transcription` — OpenRouter and OpenAI provider adapters.
- `src/worker.ts` — polling and per-job orchestration.

### Shared Infrastructure
- Both API and worker share the SQLite database and selected file storage.
- Docker Compose mounts `appdata` for the database and local audio files.

## Commits

- Use Conventional Commits format: `<type>(<project>): <summary>`.
- Use the project name as the commit scope. For example, use `feat(worker-ts): ...` for worker changes and `feat(api): ...` for API changes.
- Do not include files from more than one project in the same commit.
- Commit repository-wide guidance or configuration separately from project-specific changes.
- Keep commit summaries imperative, concise, and without a trailing period.
