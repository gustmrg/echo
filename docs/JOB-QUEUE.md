# Job queue protocol

The API owns SQLite. Workers have S3 credentials and RabbitMQ connectivity only.
Both transcription and refinement use `echo.jobs` and `echo.results` by default.

Transcription job:
```json
{"job_id":"<uuid>","claim_token":"<uuid>","kind":"transcription","file_key":"recordings/id/audio.wav","file_name":"audio.wav","content_type":"audio/wav"}
```
Refinement job:
```json
{"job_id":"<uuid>","claim_token":"<uuid>","kind":"refinement","source_text":"Reviewed transcript","format":"notes"}
```
Results preserve `job_id`, `claim_token`, and `kind` and carry `status`:
- `completed` transcription: `transcription_text`.
- `completed` refinement: `content`, `model`, `provider`, `prompt_version`.
- `failed`: `error` (sanitized) and `retryable`.

The API atomically changes a pending job to processing and adds its message to
`job_outbox`. Publishing runs outside that database transaction on a dedicated
publisher-confirmed RabbitMQ channel. After a broker confirmation the outbox row is
removed. A failure between confirmation and removal can produce duplicates, which
are safe at the result boundary. Failed publishes leave the outbox intact. No
provider call or RabbitMQ publish occurs in upload HTTP handlers, so a broker outage
does not turn a committed upload into an HTTP error.

After committing a new recording, transcription retry, or refinement job to SQLite,
the API triggers an in-process bounded signal (`IJobDispatcherSignal`) so the outbox
dispatcher wakes up immediately rather than waiting for `RabbitMQ:PollIntervalMs`.
Multiple concurrent notifications coalesce into a single pending wakeup without
blocking callers. The periodic `PollIntervalMs` timer still runs as a fallback for
delayed retries (`NextAttemptAt`), crash recovery, and stale-lease reclamation.

The worker acknowledges only after publishing a confirmed result, or nacks/requeues
on a transient processing failure. It rejects malformed jobs to `echo.jobs.invalid`.
The API consumes `echo.results` using an event-driven push consumer
(`AsyncEventingBasicConsumer`) on a dedicated consumer channel with prefetch 10.
Valid results are applied to SQLite and acknowledged (`BasicAck`); malformed JSON or
invalid payloads are rejected (`requeue: false`) to `echo.results.invalid`; unexpected
database or transient failures nack (`requeue: true`) or trigger a clean transport
reconnect without losing messages. Deleted jobs and outdated claim tokens are ignored.

To handle concurrent HTTP requests, push-based result persistence, and outbox
dispatching safely on SQLite, the API enables `PRAGMA journal_mode=WAL` at startup
for file-backed SQLite databases and enforces `PRAGMA synchronous=NORMAL`,
`PRAGMA busy_timeout=5000`, and `PRAGMA foreign_keys=ON` on opened connections.

RabbitMQ owns normal in-flight delivery recovery, and the API adds a safety-net
processing lease controlled by `RabbitMQ:ProcessingTimeoutSeconds` (default `600`,
must be `> 0`). Before dispatching new work, `JobDispatch.ReclaimStale` checks
`Processing` transcription and refinement jobs whose `(UpdatedAt ?? CreatedAt)` is
older than `ProcessingTimeoutSeconds`:
- If `AttemptCount < 3`, the job resets to `Created` with `ClaimToken = null` and
  `NextAttemptAt = now` (and `TranscriptionJob` increments `RetryCount` and resets
  its recording to `Pending`). Re-dispatch issues a fresh `ClaimToken`, so any late
  zombie result carrying the previous token is safely ignored.
- If `AttemptCount >= 3`, the job transitions to `Failed` with a timeout failure
  reason (and `TranscriptionJob` increments `RetryCount` and marks its recording
  `Failed`).

An API retry always creates a fresh claim token. A worker failure result can
schedule 5s/10s retry delays; after three dispatch attempts the job becomes failed.
A user can explicitly retry a failed transcription through the existing endpoint.
The worker also allows one transient redelivery within each dispatch attempt, so
up to six provider calls can occur before the API's automatic attempts are exhausted.
Crashes, lease timeouts, and uncertain confirms may cause additional provider calls
(at-least-once).

Keep RabbitMQ's durable volume and back up broker data alongside SQLite. Avoid
purging queues with in-flight jobs; if a message is ever lost, lease recovery will
eventually reclaim or fail the affected job after `ProcessingTimeoutSeconds`.

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
