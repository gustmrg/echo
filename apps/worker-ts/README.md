# Echo TypeScript Worker

TypeScript replacement for the Go transcription worker. During the migration it
lives beside `apps/worker`; Compose will switch to this worker only after the
database, storage, transcription, and orchestration phases are complete.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

The entrypoint currently validates configuration and exits. The SQLite store
implements atomic job claiming, terminal state transitions, and stale
processing-lease recovery. Phase 5 adds streaming readers for local files and
AWS S3. Phase 6 adds OpenRouter and OpenAI transcription adapters. Processing-
loop wiring is implemented in a later phase.

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
