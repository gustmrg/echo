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

Echo is organized as separate application layers inside the `apps` folder:

```text
apps/
  web/      React frontend built with Vite
  api/      .NET API built with Minimal APIs
  worker/   Go worker service for background processing
```

### `apps/web`

The web app is the user-facing frontend. It will be built with React and Vite, and is responsible for recording or importing audio, presenting transcripts, collecting edits, and displaying generated outputs.

### `apps/api`

The API is the backend application. It will be built with .NET Minimal APIs and is responsible for exposing HTTP endpoints, coordinating persistence, authentication, workflow state, and communication between the frontend and background processing.

### `apps/worker`

The worker service handles long-running or asynchronous jobs. It will be built with Go and is responsible for background processing such as audio transcription, AI refinement jobs, and other queued workflow tasks.

## License

MIT - see `LICENSE`.
