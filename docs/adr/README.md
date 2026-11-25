# Architecture Decision Records

This directory captures the key architectural decisions behind Echo's as-built system. Each record documents the context, chosen design, consequences, trade-offs, and conditions under which the decision should be revisited.

## Index

| ADR | Title | Status | Summary |
| --- | --- | --- | --- |
| [ADR-0001](0001-sqlite-outbox-with-rabbitmq.md) | Single-Owner SQLite with Transactional Outbox and RabbitMQ | Accepted | Keep SQLite owned exclusively by the API while decoupling asynchronous job execution through `job_outbox` and RabbitMQ. |
| [ADR-0002](0002-polyglot-dotnet-api-typescript-worker.md) | Polyglot Backend: ASP.NET Core 10 API and TypeScript Worker | Accepted | Pair vertical-slice Minimal APIs in .NET 10 for persistence and HTTP with a stateless Node.js/TypeScript worker for S3 and AI processing. |
| [ADR-0003](0003-s3-object-storage-with-seaweedfs-dev.md) | S3-Compatible Object Storage with SeaweedFS for Local Development | Accepted | Store uploaded audio outside the API container volume behind `IFileStorage`, using SeaweedFS `weed mini` locally and AWS S3 in production. |
| [ADR-0004](0004-idempotency-claim-tokens-and-optimistic-concurrency.md) | Idempotency, Claim Tokens, and Optimistic Concurrency | Accepted | Enforce retry-safe uploads, revision-checked transcript edits, replay-deduplicated refinements, and stale-result protection across asynchronous boundaries. |
| [ADR-0005](0005-private-deployment-and-evolution-roadmap.md) | Private Single-User Milestone and Evolution Roadmap | Accepted | Bound the current deployment to private single-user use and define the concrete path toward auth, playback, search, local AI, and publishing workflows. |

## Related Documentation

- [Features & Capability Matrix](../FEATURES.md) — As-built feature inventory (`Live` vs. `Planned`).
- [Job Queue Protocol](../JOB-QUEUE.md) — Wire contracts, delivery semantics, and operational rules for RabbitMQ jobs.
