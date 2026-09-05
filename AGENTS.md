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
- Local development uses SeaweedFS via S3; production uses AWS S3.
- File keys are structured by context and identifier (e.g., `recordings/<id>/<filename>`).

## Back-End Patterns (Worker — TypeScript / Node.js)

### RabbitMQ Job Processing
- Only the API accesses SQLite. The worker has no database dependency or database volume.
- The API commits jobs, then atomically prepares an outbox message and claim token.
- The API publishes persistent jobs with publisher confirms and consumes results idempotently.
- The worker consumes messages with prefetch 1, downloads S3 audio to a temporary file, processes it, publishes a confirmed result, then acknowledges the input.
- Transient failures receive one delayed nack/requeue per delivery, then a failed result. The API permits up to three job attempts with backoff.
- SIGINT/SIGTERM abort processing and close the connection; RabbitMQ redelivers unacknowledged work.
- Refinement messages carry the source snapshot and format; they follow the same transport.

### Source Layout
- `src/config` — validates environment variables into typed configuration.
- `src/messaging` — message contracts, RabbitMQ consumption, reconnect, and acknowledgements.
- `src/storage` — S3 and optional local filesystem streaming readers.
- `src/transcription` — OpenRouter and OpenAI provider adapters.
- `src/worker.ts` — temporary audio download and per-job processing.
- `src/refinement` — chat provider adapter and prompts.

### Infrastructure
- Development uses SeaweedFS S3, production uses AWS S3.
- RabbitMQ has a dedicated durable volume; SQLite is mounted only in the API (and its volume-init helper).
- Stop old SQLite workers before migrating to RabbitMQ; migrate existing local audio preserving storage keys.

## Commits

- Use Conventional Commits format: `<type>(<project>): <summary>`.
- Use the project name as the commit scope. For example, use `feat(worker-ts): ...` for worker changes and `feat(api): ...` for API changes.
- Do not include files from more than one project in the same commit.
- Commit repository-wide guidance or configuration separately from project-specific changes.
- Keep commit summaries imperative, concise, and without a trailing period.
