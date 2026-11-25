# ADR-0002: Polyglot Backend — ASP.NET Core 10 API and TypeScript Worker

- **Status:** Accepted
- **Date:** 2026-11-25
- **Related:** [ADR-0001](0001-sqlite-outbox-with-rabbitmq.md), [ADR-0003](0003-s3-object-storage-with-seaweedfs-dev.md), [Job Queue Protocol](../JOB-QUEUE.md)

## Context

Echo has two distinct backend workloads:

1. **Core API & State Management:** HTTP multipart upload validation (magic-byte sniffing, 25 MB limit), idempotency checks, relational persistence with migrations, optimistic concurrency on transcript revisions, and transactional job orchestration.
2. **Asynchronous Media & AI Execution:** Streaming audio objects from S3 to private temporary files, invoking external speech-to-text and chat completion HTTP APIs (`OpenRouter`, `OpenAI`), handling timeouts/aborts, and preparing for future media preprocessing or local AI model adapters.

The repository previously used a Go worker alongside the .NET API, but that worker shared SQLite directly and diverged from the API schema. When replacing it with a RabbitMQ-driven worker, we had to decide whether to consolidate background processing into the .NET API process, build a .NET worker service, or use a dedicated Node.js/TypeScript worker.

## Decision

Maintain a deliberate two-runtime backend separated by a versioned JSON message contract over RabbitMQ:

- **API (`apps/api` — ASP.NET Core on .NET 10):** Implemented with Minimal APIs and Vertical Slice Architecture (`Features/Recordings`, `Features/Refinements`, `Features/Jobs`). Each HTTP operation is a self-contained static `Handle` method injecting `EchoDbContext` and `IFileStorage` directly—no controllers and no generic repository/service layers. EF Core 10 with SQLite (`EFCore.NamingConventions`) owns schema migrations, and OpenAPI/Scalar provide built-in API documentation in development.
- **Worker (`apps/worker-ts` — Node.js 24+ / TypeScript):** A lightweight, stateless consumer using `amqplib` (`prefetch(1)` + `ConfirmChannel`), `@aws-sdk/client-s3`, and native Node `fetch`/`FormData`/`AbortSignal`. Organized by clear adapter boundaries (`config`, `messaging`, `storage`, `transcription`, `refinement`, `worker.ts`). It shares TypeScript tooling (`pnpm`, ESLint, TypeScript 6) with `apps/web`.

## Consequences

### Positive

- **Clean fault and resource isolation.** Long-running AI calls (default `JOB_TIMEOUT_MS = 120000`), audio downloads, and transient provider failures stay out of the API process. Worker crashes or restarts never interrupt active HTTP requests or SQLite connections; RabbitMQ redelivers unacknowledged messages.
- **Independent scaling of AI concurrency.** Multiple worker replicas can consume `echo.jobs` concurrently (`prefetch(1)` per worker) without touching SQLite or scaling the API.
- **Strong fit per domain.** ASP.NET Core Minimal APIs + EF Core give first-class migrations, typed endpoint validation, and transactional integrity in very little code. TypeScript + Node 24 offers fast iteration for JSON/HTTP AI SDKs and shares language and linting conventions with the React frontend.
- **Prepared for heavy or local media/AI adapters.** Because the worker speaks only RabbitMQ messages and S3 keys, adding a GPU/local Whisper runner, `ffmpeg` audio chunking/transcoding, or an OpenAI-compatible local inference adapter (or even a specialized Python/native worker for a specific queue) requires zero changes to the API's HTTP surface or database schema.

### Negative and Trade-offs

- **Two runtimes in CI and containers.** Both `.NET 10` and `Node 24 / pnpm` toolchains must be built, patched, tested, and maintained across Dockerfiles and `.github/workflows/checks.yml`.
- **Cross-language contract discipline.** Message payloads (`JobMessage` / `JobResult` in `apps/api/Echo.API/Features/Jobs/JobMessages.cs` and `apps/worker-ts/src/messaging/messages.ts`) are duplicated in C# and TypeScript rather than shared via a single compiled library. Contract drift must be prevented by automated integration and E2E tests.
- **Operational overhead vs. a single-process monolith.** For a single-user app, running a separate worker container plus RabbitMQ is heavier than running an in-process `BackgroundService` inside `apps/api`. We accept this overhead deliberately to preserve process isolation, demonstrate production-grade asynchronous boundaries, and avoid refactoring when heavier media or local inference workloads arrive.

## Alternatives Considered

- **In-process .NET `BackgroundService` monolith (rejected):** Eliminates a second runtime and message contract duplication, but couples slow AI/media I/O and future local-model/transcoding dependencies to the API container and prevents independent worker scaling.
- **Keep the legacy Go worker (rejected):** Added a third language ecosystem (C#, TypeScript, Go) across a small repo without meaningful performance gains for I/O-bound HTTP calls to AI providers.
- **Rewrite the API in TypeScript/Node.js (rejected):** Would unify on one language, but gives up EF Core's mature migration/concurrency tooling and the clean .NET 10 Minimal API vertical-slice backend already proven in the repository.

## Revisit Conditions

- If contract duplication between C# and TypeScript grows beyond the current two job kinds (`transcription`, `refinement`), introduce a shared JSON Schema definition generated or validated in CI for both services.
- If local model inference requires Python-native libraries (e.g., `faster-whisper` or PyTorch), add a dedicated worker consuming the same RabbitMQ protocol rather than forcing native bindings into Node.js or .NET.
