# ADR-0001: Single-Owner SQLite with Transactional Outbox and RabbitMQ

- **Status:** Accepted
- **Date:** 2026-11-25
- **Related:** [Job Queue Protocol](../JOB-QUEUE.md), [ADR-0002](0002-polyglot-dotnet-api-typescript-worker.md), [ADR-0004](0004-idempotency-claim-tokens-and-optimistic-concurrency.md)

## Context

Echo processes long-running, failure-prone AI work (audio transcription and LLM-based text refinement) asynchronously after a user uploads audio or requests a formatted output.

Earlier prototypes suffered from two coupled failure modes (documented in the historical [current-state assessment](../../plans/current-state-assessment.md)):

1. **Shared SQLite access across services.** A separate worker mounted the same SQLite file and queried tables directly with hand-written SQL. Schema migrations owned by EF Core in the API drifted from the worker's queries, causing silent runtime breakage, lock contention, and coupled container deployments (both services had to run on the same host volume).
2. **Dual-write coupling on HTTP upload.** Committing a recording to SQLite and publishing directly to RabbitMQ inside the HTTP handler meant a broker outage turned a durably saved upload into an HTTP 500, while client retries risked duplicate recordings or stranded jobs.

We needed a persistence and dispatch architecture that preserves SQLite's operational simplicity for a single-user deployment while guaranteeing truthful HTTP responses, decoupled workers, and recoverable job execution.

## Decision

1. **Single-owner SQLite.** Only `apps/api` (`EchoDbContext` via EF Core 10) mounts the `appdata` volume (`/data/echo.db`) and executes SQL or schema migrations (`ApplyMigrationsAsync`). The worker has no database driver, no SQLite volume mount, and no schema coupling.
2. **Transactional Outbox in the API.** HTTP handlers (`CreateRecording`, `RetryTranscription`, `CreateRefinement`) only commit domain rows (`recordings`, `transcription_jobs`, `refinement_jobs`, `refinement_requests`) to SQLite. They never call AI providers or publish to RabbitMQ.
3. **API-owned RabbitMQ bridge (`RabbitJobService` + `JobDispatch`).** A background service inside the API runs a bounded dispatch/consume loop:
   - **Outbox prepare (`JobDispatch.Prepare`):** In a single SQLite transaction, selects due `created` transcription and refinement jobs (up to 20 each), transitions them to `processing` with a fresh `ClaimToken` and incremented `AttemptCount`, and inserts serialized JSON messages into `job_outbox`.
   - **Confirmed publish:** Outside the transaction, publishes up to 40 `job_outbox` rows as persistent messages to `echo.jobs` using RabbitMQ publisher confirmations (15s deadline), deleting each outbox row only after broker confirmation.
   - **Result consumption (`JobDispatch.Apply`):** Drains up to 40 messages per cycle from `echo.results` (`autoAck: false`), applies state transitions atomically in SQLite (ignoring deleted jobs or stale claim tokens), and calls `BasicAckAsync` only after the SQLite transaction commits. Malformed messages are rejected to `echo.jobs.invalid` or `echo.results.invalid`.
4. **Broker-owned in-flight delivery.** RabbitMQ handles in-flight redelivery if a worker disconnects or receives `SIGINT`/`SIGTERM`. The API does not maintain SQLite processing leases; instead it bounds automatic dispatch attempts to 3 with exponential backoff (`5s`, `10s`) when workers return retryable failure results.

## Consequences

### Positive

- **Zero cross-service schema drift.** One process and one ORM own all tables, indexes, and migrations.
- **Resilient HTTP writes.** A RabbitMQ outage delays background processing instead of failing uploads or transcript edits.
- **Stateless, independently deployable workers.** Workers only need S3 credentials, RabbitMQ connectivity, and AI provider keys; they do not need access to the API host's filesystem.
- **Atomic state transitions.** Recording status, job status, transcript text, and retry metadata update together inside SQLite transactions.

### Negative and Operational Constraints

- **Single API replica constraint.** Because SQLite is a local file mounted exclusively by the API container (`appdata`), the API cannot be horizontally scaled across multiple hosts or replicas without replacing SQLite.
- **Polling latency floor.** `RabbitJobService` polls `job_outbox` and `echo.results` on `PollIntervalMs` (default `1000 ms`), adding up to ~1 second of dispatch/apply latency per hop—acceptable for multi-second AI jobs, unsuitable for sub-100ms workflows.
- **Durable broker state is part of the recovery boundary.** Once an outbox row is deleted after broker confirmation, RabbitMQ's durable `rabbitdata` volume is the sole holder of the in-flight job message. Purging queues with active `processing` jobs or losing the RabbitMQ volume leaves those jobs stuck in `processing` without automatic lease expiry (see [Job Queue Protocol](../JOB-QUEUE.md)).
- **Two stateful volumes to back up.** Operators must back up both `appdata` (SQLite) and `rabbitdata` (RabbitMQ), in addition to S3 object storage.

## Trade-offs Considered

- **Shared SQLite polling (rejected):** Simpler infrastructure (no broker), but couples the worker to the API host filesystem, invites cross-language schema drift, and adds SQLite write-lock contention under concurrent polling.
- **PostgreSQL + `SKIP LOCKED` queue or transactional outbox (deferred):** Eliminates the single-replica constraint and gives native full-text search, multi-writer concurrency, and single-store backup. However, for a private single-user deployment, operating a managed or self-hosted PostgreSQL instance adds memory overhead, connection pooling, and operational tuning that are unnecessary before multi-user traffic exists.
- **Direct HTTP-to-RabbitMQ publish without outbox (rejected):** Cannot make database commit and broker publish atomic; fails uploads during broker blips and creates orphaned records or unqueued jobs.

## Migration Trigger

Move from single-owner SQLite to **PostgreSQL** (preserving the EF Core entity model and outbox/RabbitMQ contract) when any of the following occur:

1. **Multi-replica API deployment** is required for high availability or horizontal scaling.
2. **Multi-tenant concurrency** produces measurable SQLite writer lock contention across concurrent uploads, transcript saves, and background result ingestion.
3. **Database-native capabilities**—such as multi-user row-level isolation, indexed full-text search over large transcript corpora, or point-in-time recovery (PITR)—outweigh SQLite's zero-admin simplicity.
