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
RabbitMQ        message broker for asynchronous workflows
```

The API creates a recording and transcription job, then publishes an event to
RabbitMQ. The transcription worker currently schedules work by polling SQLite,
reads the corresponding audio file, calls OpenRouter or OpenAI, and atomically
stores the resulting transcript.

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
- `rabbitmq`: RabbitMQ broker on `localhost:5672`
- `rabbitmq` management UI: `http://localhost:15672`

The API and worker share the SQLite database and locally uploaded audio through
the `appdata` Docker volume. Production Compose configuration switches both
services to AWS S3.

RabbitMQ uses the default local credentials `echo` / `echo` in Compose.

Useful commands:

```bash
docker compose logs -f api worker rabbitmq
docker compose down
docker compose down -v
```

Use `docker compose down -v` only when you want to remove the SQLite database
and locally uploaded audio.

## License

MIT - see [LICENSE](LICENSE).
