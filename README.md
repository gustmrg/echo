# Echo

Echo is an audio-first note-taking app. Record or import audio, keep your
recordings in a personal library, and turn them into useful text with AI
whenever you're ready.

Start with a transcription, review it if needed, then choose how to shape
your note: a blog post, an interview, organized thoughts, or a news brief.
Your original audio remains the source material.

## What you can create

- **Blog post**: transcribe, review, and refine into a publishable post
- **Interview**: dialog format that preserves each speaker's personality
- **Notes**: capture scattered thoughts and organize them without forcing them into a formal article
- **News brief**: factual summary with clear points and bullets

## How it works

1. Record or import audio and save it to your library
2. Generate an initial transcription
3. Return to your notes whenever you're ready
4. Review and edit the transcript if needed
5. Choose an output format: Blog, Interview, Notes, or News
6. Ask AI to organize and polish the text
7. Review, copy, or export the result

You don't need to finish the entire workflow at once. Keep multiple
recordings and return to any note later to review or format it.

## AI providers

Echo aims to support both local models and external AI APIs, with separate
provider choices for transcription and text formatting.

The current implementation includes OpenAI and OpenRouter integrations.
Local model support is part of the intended scope and still needs to be
implemented and validated.

## Current scope

Echo currently targets private use. Authentication and ownership, production
web hosting, and server-side pagination remain outside this milestone.
Keep the deployment private until access control exists.

## Architecture

The API is the only service with access to SQLite. A TypeScript worker consumes
RabbitMQ messages and returns results through a separate queue. Development uses
SeaweedFS S3; production uses AWS S3.

```text
API + SQLite/outbox → RabbitMQ jobs → TypeScript worker + S3 + AI
API + SQLite        ← RabbitMQ results ← worker
```

Uploads commit recording/job rows atomically. The API dispatcher creates durable
outbox messages and publishes with confirms. It also consumes results, updating
recordings and refinements idempotently using claim tokens. The worker downloads
audio to a temporary file, processes it, publishes a confirmed result, and acks.
Transient failures requeue; the API bounds automatic retries. Transcript edits and
refinement source revisions retain their existing optimistic concurrency semantics.

See [job queue protocol and upgrade procedure](docs/JOB-QUEUE.md).

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

The Compose stack starts the API on `http://localhost:8080`, the worker,
RabbitMQ (AMQP `localhost:5672`, management `http://localhost:15672`), and
SeaweedFS (`http://localhost:8333`). The API alone mounts `appdata` for SQLite.
RabbitMQ and SeaweedFS have separate durable volumes.

Local broker credentials are `echo` / `echo-dev-only`; S3 credentials are
`echo-dev` / `echo-dev-secret`, with bucket `echo` by default. These examples
are for local development. Replace broker credentials/URL for production.

Production uses `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.
This excludes the development override and SeaweedFS; configure the real S3 bucket
and AWS credentials/role. The API should be exposed through your private reverse proxy.

Useful commands:

```bash
docker compose logs -f api worker
docker compose down
docker compose down -v
```

Use `docker compose down -v` only when you want to remove the SQLite database
and the RabbitMQ/S3 data volumes.

## Run the web app

Use Node 24+, pnpm 10.34.5, and .NET 10. From `apps/web`, run
`pnpm install --frozen-lockfile`, then `pnpm dev`. The default API target is
`http://localhost:5143` for `dotnet run`; when using Compose, launch Vite with
`API_PROXY_TARGET=http://localhost:8080 pnpm dev`.

The worker uses the transcription provider's credentials for refinement.
`REFINEMENT_MODEL` optionally overrides the default (`openai/gpt-4.1-mini` on
OpenRouter, `gpt-4.1-mini` on OpenAI). `REFINEMENT_BASE_URL` overrides the chat
endpoint base for compatible providers. `JOB_TIMEOUT_MS` defaults to 120 seconds. RabbitMQ manages redelivery after worker interruption.

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

Start test infrastructure with `docker compose -p echo-tests up -d --wait rabbitmq seaweedfs`
before the browser tests. The test harness creates unique queues, a temporary API
database and a unique S3 bucket, then removes them at shutdown. It runs the real API,
RabbitMQ worker and S3 adapters with a local AI provider stub (no paid calls).
It checks upload recovery, durable editing, refinement, bounded retries and deletion.
Stop test infrastructure afterward with `docker compose -p echo-tests down`.
API tests verify migrations, outbox durability, duplicate/stale results and retry bounds.

## License

MIT - see [LICENSE](LICENSE).
