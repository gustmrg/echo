# Echo Worker

Node 24 / TypeScript worker. It consumes RabbitMQ jobs, reads audio from S3,
transcribes or refines it, and publishes results. It never accesses SQLite.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

## Configuration

```dotenv
RABBITMQ_URL=amqp://echo:echo-dev-only@localhost:5672
RABBITMQ_JOB_QUEUE=echo.jobs
RABBITMQ_RESULT_QUEUE=echo.results
STORAGE_PROVIDER=s3
S3_BUCKET=echo
AWS_REGION=us-east-1
TRANSCRIPTION_PROVIDER=openrouter
OPENROUTER_API_KEY=...
```

For local SeaweedFS also set `S3_ENDPOINT=http://localhost:8333`,
`S3_FORCE_PATH_STYLE=true`, `AWS_ACCESS_KEY_ID=echo-dev`, and
`AWS_SECRET_ACCESS_KEY=echo-dev-secret`. Production AWS credentials use the SDK
credential chain. `STORAGE_PROVIDER=local` and `STORAGE_LOCAL_ROOT` remain available
for isolated tests, but Compose always uses S3 and never mounts API data in the worker.

`JOB_TIMEOUT_MS` defaults to 120000. `RABBITMQ_RECONNECT_MS` and
`RABBITMQ_RETRY_MS` default to 5000. Queue names must match API configuration.
For OpenAI set `TRANSCRIPTION_PROVIDER=openai` and `OPENAI_API_KEY`.
`REFINEMENT_MODEL` and `REFINEMENT_BASE_URL` override the chat model/endpoint;
refinement uses the selected provider's credentials.

## Delivery and failure handling

Both queues are durable; messages are persistent. The consumer uses prefetch 1.
A result must receive a broker publisher confirmation before its input is acked.
Transient processing failures wait and nack/requeue once; a redelivered failure
produces a failed result. The API retries retryable results up to three dispatch
attempts (5s/10s backoff). Unsupported audio formats fail without retry.

Transport failures reconnect and leave deliveries unacknowledged. Shutdown aborts
provider calls and closes the connection so RabbitMQ can redeliver. Malformed
messages go to `<queue>.invalid` dead-letter queues. Operators should inspect and
repair these messages rather than replay them blindly.

Audio is downloaded into a private temporary directory, then streamed from disk
to the transcription adapter. The directory is removed after success, failure,
or graceful cancellation. A hard process kill can leave temporary files until
container replacement; no audio or database volume is mounted in the worker.

Delivery is at least once: provider calls can repeat after a crash or lost
confirmation. The API fences results using the job ID and claim token, so duplicate
or obsolete results cannot overwrite a completed job or a newer attempt.

See [message protocol](../../docs/JOB-QUEUE.md) for contracts and recovery details.

For a real broker restart test, start a disposable Compose project and run from
this directory:

```bash
ECHO_TEST_DOCKER_PROJECT=echo-tests pnpm test:integration
```

This command **restarts that project's RabbitMQ container**. Without an explicit
project it skips the test. Use only disposable infrastructure.
