# Echo

Echo is a speech-to-text workflow app that records audio, transcribes it, then
uses AI to polish and structure the text. It is designed for fast capture,
review, and publishing-ready outputs.

## What you can create

- **Blog post**: transcribe, review, and refine into a publishable post
- **Interview**: dialog format that preserves each speaker's personality
- **Notes**: quick thought capture and clean transcription
- **News brief**: factual summary with clear points and bullets

## How it works

1. Record or import audio
2. Transcribe audio to text
3. Review and edit the transcript
4. Choose an output format: Blog, Interview, Notes, or News
5. Let AI refine the text to match the selected structure
6. Copy or export the final result

## Architecture

Echo currently runs as an API service and a TypeScript background worker. They
share SQLite persistence and file storage. Local development stores audio on
the shared Docker volume; production uses AWS S3.

```text
apps/api/       .NET Minimal API for recording ingestion and metadata
apps/worker-ts/ TypeScript worker for polled transcription jobs
SQLite          shared database for recordings and transcription jobs
Local/S3        audio storage selected by environment
```

The API creates a recording and transcription job in one database transaction.
The worker polls SQLite, reads the audio, calls OpenRouter or OpenAI, and
atomically stores the transcript. Transcript edits use optimistic revision checks.
Refinement jobs snapshot the saved transcript and persist Markdown outputs for
Blog, Interview, Notes, and News. Both job types use leases, claim tokens,
deadlines, and at most three attempts with backoff.

## Run with Docker Compose

From the project root, create a local environment file:

```bash
cp .env.example .env
```

Fill in the required values in `.env`:

```dotenv
TRANSCRIPTION_PROVIDER=openrouter
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_TRANSCRIPTION_MODEL=openai/gpt-4o-mini-transcribe
```

Start the local stack:

```bash
docker compose up --build
```

The Compose stack starts:

- `api`: .NET API on `http://localhost:8080`
- `worker`: TypeScript background worker for transcription jobs

The API and worker share the SQLite database and locally uploaded audio through
the `appdata` Docker volume. Production Compose configuration switches both
services to AWS S3.


Useful commands:

```bash
docker compose logs -f api worker
docker compose down
docker compose down -v
```

Use `docker compose down -v` only when you want to remove the SQLite database
and locally uploaded audio.

## Run the web app

Use Node 24+, pnpm 10.34.5, and .NET 10. From `apps/web`, run
`pnpm install --frozen-lockfile`, then `pnpm dev`. The default API target is
`http://localhost:5143` for `dotnet run`; when using Compose, launch Vite with
`API_PROXY_TARGET=http://localhost:8080 pnpm dev`.

The worker uses the transcription provider's credentials for refinement.
`REFINEMENT_MODEL` optionally overrides the default (`openai/gpt-4.1-mini` on
OpenRouter, `gpt-4.1-mini` on OpenAI). `REFINEMENT_BASE_URL` overrides the chat
endpoint base for compatible providers. `JOB_TIMEOUT_MS` defaults to 120 seconds
(or half the lease if shorter) and must be less than `PROCESSING_LEASE_MS`.

Stopped audio is retained in the current page until uploaded or discarded; use
Download audio before closing the page. Upload retries reuse a UUID key, and the
API rejects reuse with different audio. Edits save to the server; leaving the
editor waits for saving and blocks on a conflict or network failure. Browser
storage is only a recovery draft. Outputs always refer to the saved revision that
created them; changing the text hides older outputs from the current view.

## Verification

From the repository root:

```bash
dotnet tool restore
dotnet test apps/api/Echo.slnx
pnpm --dir apps/worker-ts install --frozen-lockfile
pnpm --dir apps/worker-ts typecheck
pnpm --dir apps/worker-ts test
pnpm --dir apps/worker-ts lint
pnpm --dir apps/worker-ts build
pnpm --dir apps/web install --frozen-lockfile
pnpm --dir apps/web test
pnpm --dir apps/web lint
pnpm --dir apps/web build
pnpm --dir apps/web exec playwright install chromium
pnpm --dir apps/web test:e2e
```

Worker integration tests use the actual EF migration set. The browser test starts
an isolated temporary database, local storage, API, worker, and provider stub on
ports 5190–5193. It checks lost upload responses, deduplication, immediate-save
navigation, cross-browser persistence, refinement, revision invalidation, and
deletion. It requires no provider credentials or paid calls.

Authentication and ownership, production web hosting, and pagination remain
outside this milestone. Keep the deployment private until access control exists.

## License

MIT - see [LICENSE](LICENSE).
