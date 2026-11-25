# Job queue protocol

The API owns SQLite. Workers have S3 credentials and RabbitMQ connectivity only.
Both transcription and refinement use `echo.jobs` and `echo.results` by default.

Transcription job:
```json
{"job_id":"<uuid>","claim_token":"<uuid>","kind":"transcription","file_key":"recordings/id/audio.wav","file_name":"audio.wav","content_type":"audio/wav","correlation_id":"<optional-id>"}
```
Refinement job:
```json
{"job_id":"<uuid>","claim_token":"<uuid>","kind":"refinement","source_text":"Reviewed transcript","format":"notes","correlation_id":"<optional-id>"}
```
Results preserve `job_id`, `claim_token`, `kind`, and (when present) `correlation_id`, and carry `status`:
- `completed` transcription: `transcription_text`.
- `completed` refinement: `content`, `model`, `provider`, `prompt_version`.
- `failed`: `error` (sanitized) and `retryable`.

## Correlation and health checks

HTTP requests to the API accept an optional `X-Correlation-Id` header (1–64 characters matching `[A-Za-z0-9._:-]`). When absent or invalid, the API generates a new UUID, echoes it in the `X-Correlation-Id` response header, binds it to the request logging scope, and persists it on newly created or retried `transcription_jobs` and `refinement_jobs`.

When dispatching jobs from `job_outbox`, the API includes the optional `correlation_id` field in the JSON payload and sets the AMQP `correlationId` message property. The worker accepts messages with or without `correlation_id` (falling back to AMQP `properties.correlationId`), emits job-scoped structured JSON telemetry (`Job started`, `Job completed`, `Job requeued after transient failure`, `Job failed` with `duration_ms`), and echoes `correlation_id` on both the `JobResult` payload and AMQP `correlationId` property.

The API exposes two unauthenticated probe endpoints:
- `GET /health/live` — liveness probe with no external dependency checks; always returns HTTP `200` with `{"status":"healthy"}`.
- `GET /health/ready` — readiness probe running the `sqlite` (database connectivity) and `rabbitmq` (live broker connection state) checks; returns HTTP `200` when all checks pass or HTTP `503` when any check fails, with `{"status":"...","checks":{...}}`.

Note: the API runtime image (`mcr.microsoft.com/dotnet/aspnet:10.0`) does not ship with `curl` or `wget`, so `docker-compose.yml` does not configure an in-container HTTP probe command for the `api` service; external orchestrators or reverse proxies can probe `/health/live` and `/health/ready` directly.

The API atomically changes a pending job to processing and adds its message to
`job_outbox`. Publishing runs outside that database transaction. After a broker
confirmation the outbox row is removed. A failure between confirmation and removal
can produce duplicates, which are safe at the result boundary. Failed publishes
leave the outbox intact. No provider call or RabbitMQ publish occurs in upload HTTP
handlers, so a broker outage does not turn a committed upload into an HTTP error.

The worker acknowledges only after publishing a confirmed result, or nacks/requeues
on a transient processing failure. It rejects malformed jobs to `echo.jobs.invalid`.
The API acknowledges only after saving results; invalid results are dead-lettered
to `echo.results.invalid`. Deleted jobs and outdated claim tokens are ignored.

RabbitMQ owns in-flight delivery recovery; queued jobs do not expire based on a
SQLite lease. An API retry creates a fresh claim token. A worker failure result can
schedule 5s/10s retry delays; after three dispatch attempts the job becomes failed.
A user can explicitly retry a failed transcription through the existing endpoint.
The worker also allows one transient redelivery within each dispatch attempt, so
up to six provider calls can occur before the API's automatic attempts are exhausted.
Crashes and uncertain confirms may cause additional provider calls (at-least-once).

Keep RabbitMQ's durable volume. Losing or purging confirmed queue contents is not
a supported recovery operation: those messages no longer have outbox rows. Back up
broker data as well as SQLite, and do not purge queues with processing jobs.

## Upgrade from the SQLite worker

1. Stop the old worker and API; back up the database and audio volume.
2. Copy existing local audio to the selected S3 bucket with identical relative keys.
   For an extracted `files` directory, use `aws --endpoint-url http://localhost:8333
   s3 sync /path/to/files s3://echo` with the development credentials. For AWS omit
   `--endpoint-url`. Do not delete source files until the copy is verified.
3. Start the new API and worker. The migration creates the outbox and resets jobs
   left processing by the old worker once. New deliveries use RabbitMQ recovery.
4. Verify completed outputs, a new upload, and a retry before retiring backups.

## Development S3 choice

SeaweedFS 4.45 runs with `weed mini`, credentials from environment variables and
an automatically created bucket. It supports the existing AWS SDKs with a custom
endpoint and path-style requests. Its single-container setup fits this S3-only
local environment. Compose binds S3 and RabbitMQ management ports to localhost.

Alternatives considered: LocalStack currently requires an account/auth token for
AWS features; Garage needs cluster/bucket/key initialization; SeaweedFS mini needs
less setup for this use case. No comparative throughput benchmark is claimed.

References:
- https://github.com/seaweedfs/seaweedfs#quick-start
- https://docs.localstack.cloud/aws/getting-started/installation/
- https://garagehq.deuxfleurs.fr/documentation/quick-start/
- https://www.rabbitmq.com/tutorials/tutorial-seven-dotnet
