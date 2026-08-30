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
