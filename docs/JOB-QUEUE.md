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
