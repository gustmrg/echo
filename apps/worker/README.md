# Echo Worker

Background worker for the Echo application. It connects to the SQLite database and runs worker-side processing outside of the API app.

## Run Locally

From this directory:

```bash
go run .
```

From the repository root:

```bash
go run ./apps/worker
```

## Transcription

The worker supports OpenRouter and direct OpenAI transcription providers.
OpenRouter is the default provider and uses `openai/gpt-4o-mini-transcribe`
unless `OPENROUTER_TRANSCRIPTION_MODEL` is set.

```bash
TRANSCRIPTION_PROVIDER=openrouter
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_TRANSCRIPTION_MODEL=openai/gpt-4o-mini-transcribe
```

To use OpenAI directly instead:

```bash
TRANSCRIPTION_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
```

## Build

From the repository root:

```bash
go build -o apps/worker/bin/worker ./apps/worker
```

Then run the built binary:

```bash
./apps/worker/bin/worker
```

The default SQLite database path is relative to the directory where the command is run.
