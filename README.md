# Echo

Echo is a text-to-speech workflow app that records audio, transcribes it to text, then uses AI to polish and structure the text. It is designed for fast capture, review, and publishing-ready outputs.

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

Echo currently runs as a backend workflow made of an API service, a background
worker, shared SQLite persistence, S3-compatible object storage, and a
RabbitMQ broker:

```text
apps/api/       .NET Minimal API for recording ingestion and metadata
apps/worker/    Go worker for queued transcription jobs
SQLite          shared database for recordings and transcription jobs
MinIO/S3        object storage for uploaded audio files
RabbitMQ        message broker for asynchronous workflows
```

### `apps/api`

The API is a .NET Minimal API application. It exposes recording endpoints for
uploading, listing, retrieving, and deleting recordings. Uploaded audio is
validated, stored in S3-compatible storage, and recorded in SQLite through
Entity Framework Core. Creating a recording also creates a pending
transcription job for the worker to process.

In development, the API also exposes OpenAPI and Scalar API reference pages.

### `apps/worker`

The worker is a Go service that polls SQLite for pending transcription jobs. For
each job, it loads the recording metadata, downloads the audio file from
S3-compatible storage, sends it to the configured transcription provider, stores
the raw transcript, and updates the recording status.

The worker supports OpenRouter by default and can also use OpenAI directly.

### Persistence and storage

The API and worker share the same SQLite database. In Docker Compose, the
database lives in the `appdata` volume at `/data/echo.db`. Audio files are stored
outside the database in the `echo-files` bucket. The local Compose stack uses
MinIO and creates the bucket automatically with the `minio-init` service.

RabbitMQ is also available in Docker Compose for broker-backed asynchronous
workflows. It uses the `rabbitmq:4-management` image, exposes AMQP on port
`5672`, and exposes the management UI on `http://localhost:15672`.

## Run with Docker Compose

From the project root, create a local environment file:

```bash
cp .env.example .env
```

Fill in the required values in `.env`:

```dotenv
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
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
- `worker`: Go background worker for transcription jobs
- `minio`: S3-compatible object storage on `http://localhost:9000`
- `minio` console: `http://localhost:9001`
- `rabbitmq`: RabbitMQ broker on `localhost:5672`
- `rabbitmq` management UI: `http://localhost:15672`

The API and worker share a SQLite database through the `appdata` Docker volume. Uploaded audio files are stored in MinIO in the `echo-files` bucket, which is created automatically by the `minio-init` service.

RabbitMQ uses the default local credentials `echo` / `echo` in Compose.

Useful commands:

```bash
docker compose logs -f api worker rabbitmq
docker compose down
docker compose down -v
```

Use `docker compose down -v` only when you want to remove the SQLite and MinIO Docker volumes.

## License

MIT - see [LICENSE](LICENSE).
