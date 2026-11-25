# ADR-0003: S3-Compatible Object Storage with SeaweedFS for Local Development

- **Status:** Accepted
- **Date:** 2026-11-25
- **Related:** [Job Queue Protocol](../JOB-QUEUE.md), [ADR-0001](0001-sqlite-outbox-with-rabbitmq.md), [ADR-0002](0002-polyglot-dotnet-api-typescript-worker.md)

## Context

Echo ingests user audio files up to 25 MB per recording (WebM, MP3, WAV, M4A, MP4, FLAC, OGG). Storing uploaded audio on the API container's local disk volume creates two problems:

1. **Worker coupling:** The worker needs to read uploaded audio to send it to transcription providers. Storing audio in the API's volume forces shared filesystem mounts across containers, breaking host independence and complicating UID/permission management.
2. **Lifecycle and capacity coupling:** Mixing binary media files with SQLite database files inside `appdata` bloats database backups, mixes hot transactional I/O with large static blobs, and prevents adopting cloud object storage features (lifecycle policies, presigned URLs for future audio playback, durable replication).

We needed one storage abstraction that works identically in local Docker Compose development, CI integration/E2E tests, and production AWS deployments.

## Decision

1. **S3-compatible object storage behind `IFileStorage`.**
   - The API defines `IFileStorage` (`CreateFileKey`, `UploadAsync`, `DeleteAsync`) with `S3FileStorage` (`AWSSDK.S3`) as the standard deployment backend and `LocalFileStorage` retained for lightweight local/unit flexibility (`Storage:Provider=Local`).
   - The worker mirrors this boundary (`FileStorage` with `S3FileStorage` via `@aws-sdk/client-s3` and optional `LocalFileStorage`), streaming objects into a private temporary directory (`mkdtemp`, fixed filename `audio`, mode `0o600`, `flags: 'wx'`) and deleting them in a `finally` block.
2. **Deterministic, safe storage keys.** `FileStorageKey.Create` generates keys in the form `recordings/<recordingId>/<guidN><ext>`. Untrusted client filenames never appear in object keys or worker temp paths, preventing path-traversal and collision issues.
3. **SeaweedFS `weed mini` for local development and CI.** `docker-compose.override.yml` runs `chrislusf/seaweedfs:4.45` with `mini -dir=/data`, static dev credentials (`echo-dev` / `echo-dev-secret`), an auto-created `echo` bucket, path-style access (`ForcePathStyle = true`), and its own `s3data` volume bound to `127.0.0.1:8333`.
4. **AWS S3 for production.** `docker-compose.prod.yml` excludes `docker-compose.override.yml` (and therefore SeaweedFS). Both API and worker use the standard AWS SDK credential chain—preferring IAM roles or workload identity, with optional `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` overrides.
5. **Failure-safe upload and delete ordering.**
   - `CreateRecording` validates magic bytes (`AudioFileValidator`) and uploads to S3 before committing SQLite; if the database save fails (or loses a concurrent idempotency race), it performs a best-effort `DeleteAsync` on the uploaded key.
   - `DeleteRecording` deletes the S3 object before removing the SQLite row, returning HTTP 500 if S3 is unavailable so database metadata is not silently removed while leaving an orphaned audio blob.

## Consequences

### Positive

- **Production/dev parity.** Both API and worker exercise their real AWS S3 SDK code paths during local development, worker integration tests, and Playwright E2E runs (`docker compose -p echo-ci up -d --wait rabbitmq seaweedfs`).
- **Clean volume separation.** `appdata` holds only SQLite (`/data/echo.db`); `s3data` holds dev audio objects; production moves audio completely off the application host to AWS S3.
- **Ready for audio playback.** Keeping audio in S3 with structured `recordings/<id>/...` keys prepares cleanly for future authenticated audio streaming or short-lived presigned download URLs without migrating files.
- **Low-friction local setup.** SeaweedFS `weed mini` starts in a single container, auto-provisions the bucket from `S3_BUCKET`, and requires no manual init job or third-party account token.

### Negative and Trade-offs

- **Best-effort cleanup on crash.** If the API process crashes between `PutObjectAsync` and `SaveChangesAsync`, an unreferenced object can remain in S3 until cleaned up by a future reconciliation job or bucket lifecycle rule.
- **Path-style toggle in dev.** Local SeaweedFS requires `ForcePathStyle = true` and a custom endpoint (`http://seaweedfs:8333`), whereas production AWS S3 uses virtual-hosted-style URLs without a custom endpoint.
- **Temporary worker disk usage.** The worker buffers each audio object (up to 25 MB) to `/tmp` before calling transcription providers, so the worker container needs writable temporary space sized for `prefetch(1)` concurrent jobs.

## Alternatives Considered

- **MinIO (replaced):** Previously used, but SeaweedFS `weed mini` provides a single-command, self-initializing S3 endpoint without a separate bucket-provisioning helper container.
- **LocalStack (rejected):** Requires account/auth token setup for ongoing AWS feature support, adding friction to local and CI runs.
- **Garage (rejected):** Well-suited for distributed self-hosted clusters, but requires explicit cluster layout, key, and bucket initialization steps for a single-node local environment.
- **Shared host volume between API and worker (rejected):** Ties worker scheduling to the API host, mixes media with SQLite backups, and diverges from the AWS S3 production target.
