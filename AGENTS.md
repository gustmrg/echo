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
- `IFileStorage` abstracts upload/download/delete operations against S3-compatible storage.
- Local development uses MinIO; production uses AWS S3.
- File keys are structured by context and identifier (e.g., `audio-recordings/<id>/<filename>`).

## Back-End Patterns (Worker — Go)

### Poll-Based Job Processing
- The worker runs a continuous loop that polls SQLite for pending `TranscriptionJob` rows.
- Graceful shutdown via `signal.NotifyContext` (SIGINT/SIGTERM).
- On each iteration: fetch next pending job → download audio from S3 → transcribe → update job and recording status.

### Internal Package Layout
- `internal/config` — loads environment variables into a typed config struct.
- `internal/db` — raw SQL queries via `database/sql` (no ORM); a `Store` type wraps the connection.
- `internal/storage` — S3 client for downloading audio files.
- `internal/transcription` — `Transcriber` interface with provider implementations (OpenRouter, OpenAI).

### Shared Infrastructure
- Both API and worker share the same SQLite database file and MinIO/S3 bucket.
- Docker Compose mounts a shared `appdata` volume for the database.

## Commits

- Use Conventional Commits format: `<type>(<project>): <summary>`.
- Use the project name as the commit scope. For example, use `feat(worker): ...` for worker changes and `feat(api): ...` for API changes.
- Do not include files from more than one project in the same commit.
- Commit repository-wide guidance or configuration separately from project-specific changes.
- Keep commit summaries imperative, concise, and without a trailing period.
