# Embedded whisper.cpp in the worker

This provider runs speech inference in the worker container or host. No Speaches,
HTTP speech server, or transcription API key is needed. Existing OpenRouter,
OpenAI and local HTTP adapters remain available. It does not implement a desktop
app or a local chat model runtime.

## Docker development

The worker image builds whisper.cpp v1.8.2 for CPU and installs FFmpeg. Native CPU
optimizations are disabled at build time so the binary is not tied to the build
machine. Model weights are kept outside the image and mounted read-only.

From the repository root, download a multilingual Whisper model:

```bash
mkdir -p models
curl --fail --location --retry 3 \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin \
  --output models/ggml-small.bin.download
mv models/ggml-small.bin.download models/ggml-small.bin
```

Use a trusted model release and verify its published checksum before deployment.
Model files ending in `.en` are English-only; use a multilingual model for
Portuguese. The worker never downloads models while handling a job.

Set these values in the root `.env`:

```dotenv
TRANSCRIPTION_PROVIDER=whisper-cpp
WHISPER_MODELS_DIR=./models
WHISPER_MODEL_PATH=/models/ggml-small.bin
WHISPER_LANGUAGE=auto
WHISPER_THREADS=4
WHISPER_USE_GPU=false
JOB_TIMEOUT_MS=600000

# Refinement is configured independently. Example: keep using OpenRouter for chat.
REFINEMENT_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
```

Start the development stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml \
  -f docker-compose.whisper.yml up -d --build
```

The model directory must exist before starting Compose and be readable by the
container's `node` user. For production, substitute `docker-compose.prod.yml` for
the development override. `WHISPER_MODEL_PATH` is the path inside the container;
`WHISPER_MODELS_DIR` is the directory on the host.

To use a separate local chat server instead, set `REFINEMENT_PROVIDER=local`,
`REFINEMENT_BASE_URL` and `REFINEMENT_MODEL` as described in
[local refinement setup](LOCAL-MODELS.md). whisper.cpp performs transcription only.
If no refinement provider is selected, whisper.cpp defaults refinement to `local`.

## Running directly on the host

Install FFmpeg and build/install `whisper-cli` following the
[upstream instructions](https://github.com/ggml-org/whisper.cpp/tree/v1.8.2).
Set `WHISPER_MODEL_PATH` to an absolute local model path. Set
`WHISPER_BINARY_PATH` and `FFMPEG_PATH` when the executables are not on PATH.
Paths may contain spaces; they are passed as arguments without a shell.

`WHISPER_LANGUAGE=pt` fixes Portuguese; `auto` detects the spoken language.
Inference uses transcription mode and does not request translation into English.
GPU use is opt-in and requires a compatible native build and runtime; setting
`WHISPER_USE_GPU=true` does not add GPU support to the CPU Docker image.

## Execution and future desktop reuse

The engine `WhisperCppEngine.transcribeFile(path, signal)` receives all paths and
options through its constructor. It has no dependency on RabbitMQ, S3, SQLite,
worker environment variables, or Electron. A future desktop process can supply
its packaged executable paths and model path in the app data directory, then call
this same method. Desktop packaging/signing and model-download UI are future work.

The current worker stream adapter copies audio to a private temporary input file.
The engine creates a separate temporary directory, converts the input to mono
16 kHz PCM WAV with FFmpeg, executes whisper-cli, and reads its text output file.
This uses additional temporary disk space; audio conversion is streamed by FFmpeg.
whisper-cli loads the model per job and may use substantial memory for long audio.
The worker retains prefetch 1; it does not introduce concurrent inference.

Both subprocesses run asynchronously without a shell. Cancellation sends SIGTERM,
then SIGKILL after two seconds if needed, and waits for process closure before
removing files. stderr retention is bounded. Failed commands, absent output and
empty transcripts become job failures, following existing retry handling. There
is no cloud fallback. No VAD model or speaker diarization is configured.

The initial default timeout is still 120 seconds; the example raises it to ten
minutes. Measure realistic recordings on the deployment hardware and adjust the
model, thread count and timeout accordingly.

## Real inference verification

After building the worker, use a downloaded model and a known audio fixture:

```bash
WHISPER_MODEL_PATH=/absolute/path/ggml-tiny.bin \
WHISPER_TEST_AUDIO=/absolute/path/recording.wav \
WHISPER_TEST_EXPECTED='known phrase' \
node apps/worker-ts/scripts/whisper-smoke.mjs
```

This exercises `processJob`, temporary audio staging, the real FFmpeg executable,
and whisper-cli without connecting to RabbitMQ or an external AI API. The expected
phrase is optional. Automated unit tests separately cover subprocess failures,
output validation, argument handling, cancellation and temporary-file cleanup.
