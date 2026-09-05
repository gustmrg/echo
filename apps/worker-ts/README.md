# Echo Worker

TypeScript background worker for Echo's audio transcription workflow. It polls
the shared SQLite database, reads audio from local storage or S3, calls the
configured transcription provider, and persists the transcript atomically.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

The worker supports atomic job claiming, stale processing-lease recovery,
structured logs, and graceful SIGINT/SIGTERM shutdown. Docker Compose runs this
worker alongside the API using the shared `appdata` volume.

## Configuration

Required for all environments:

```dotenv
DB_PATH=/data/echo.db
STORAGE_PROVIDER=local
STORAGE_LOCAL_ROOT=/data/files
TRANSCRIPTION_PROVIDER=openrouter
OPENROUTER_API_KEY=...
```

For S3, set `STORAGE_PROVIDER=s3`, `S3_BUCKET`, and optionally `AWS_REGION`.
AWS credentials use the standard SDK credential chain. For OpenAI, set
`TRANSCRIPTION_PROVIDER=openai` and `OPENAI_API_KEY`.


## Recovery and refinement

Each claim gets a random token; only that token can complete or fail the job.
Expired leases are reclaimed up to three attempts. Transient failures back off
for 5 then 10 seconds. A final failure is visible in the recording UI and can be
retried using the existing audio. `retry_count` remains a lifetime failure count;
`attempt_count` resets for an explicit user retry.

`JOB_TIMEOUT_MS` defaults to the smaller of 120 seconds or half the lease and
must be shorter than `PROCESSING_LEASE_MS`. Shutdown leaves unfinished jobs
leased for later recovery. Provider calls may be repeated after an interrupted
attempt, but stale results cannot overwrite the current claim.

The worker also polls `refinement_jobs`. `REFINEMENT_MODEL` selects the chat model
(default `openai/gpt-4.1-mini` for OpenRouter or `gpt-4.1-mini` for OpenAI).
`REFINEMENT_BASE_URL` optionally overrides the provider base URL. Credentials are
the selected transcription provider's credentials. Generation records preserve
the source revision/text, format, returned model, provider, and prompt version.

Run `dotnet tool restore` at the repository root before migration-backed tests.
