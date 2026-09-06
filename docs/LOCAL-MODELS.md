# Local speech models and LLM refinement

For embedded inference without an HTTP server, use
[whisper.cpp in the worker](WHISPER-CPP.md). The following section covers the
optional HTTP provider.

Echo can send audio to a speech model running on your own machine or server.
Select `TRANSCRIPTION_PROVIDER=local`; OpenRouter and OpenAI remain available.
The local server must implement multipart `POST /v1/audio/transcriptions` and
return JSON such as `{"text":"transcribed speech"}`. A text-only chat LLM is
insufficient for this endpoint. Whisper via Speaches is one compatible option.
Echo connects to the inference server; it does not install or execute model weights
inside the worker. Models must be downloaded before processing jobs.

## Start a speech server

Follow the [Speaches installation guide](https://speaches.ai/installation/)
for CPU or GPU setup. A CPU example:

```bash
docker run -d --name echo-speaches -p 8000:8000 \
  -v echo-models:/home/ubuntu/.cache/huggingface/hub \
  ghcr.io/speaches-ai/speaches:latest-cpu
```

This publishes port 8000 on the host interfaces so the Echo worker container can
reach it. Restrict access to your development machine/private network. Model
weights persist in `echo-models`. Use a pinned image version for reproducible deployments.

With `uv` installed, download a multilingual model (including Portuguese):

```bash
SPEACHES_BASE_URL=http://localhost:8000 \
  uvx speaches-cli model download Systran/faster-whisper-small
```

Check inference before starting Echo:

```bash
curl --fail http://localhost:8000/v1/audio/transcriptions \
  -F 'file=@recording.wav' \
  -F 'model=Systran/faster-whisper-small' \
  -F 'response_format=json'
```

See [Speaches speech-to-text usage](https://speaches.ai/usage/speech-to-text/)
for model discovery and other speech models. Initial downloads require internet;
transcription runs locally once the server has the model.

## Configure Echo

In the root `.env`, configure local transcription with remote refinement:

```dotenv
TRANSCRIPTION_PROVIDER=local
LOCAL_TRANSCRIPTION_BASE_URL=http://host.docker.internal:8000/v1
LOCAL_TRANSCRIPTION_MODEL=Systran/faster-whisper-small
LOCAL_TRANSCRIPTION_API_KEY=
REFINEMENT_PROVIDER=openrouter
OPENROUTER_API_KEY=your-openrouter-api-key
JOB_TIMEOUT_MS=600000
```

The audio is sent only to the configured speech server. In this mixed setup,
requesting refinement sends the transcript to OpenRouter. To keep refinement
local too, run a chat server, for example Ollama, download a chat model with
`ollama pull llama3.2:3b`, and replace the refinement settings with:

```dotenv
REFINEMENT_PROVIDER=local
REFINEMENT_BASE_URL=http://host.docker.internal:11434/v1
REFINEMENT_MODEL=llama3.2:3b
REFINEMENT_API_KEY=
```

Ollama supports [compatible chat completions](https://docs.ollama.com/api/openai-compatibility).
Its listening address must be reachable from Docker (configure `OLLAMA_HOST` for
that interface and restart Ollama); keep access limited to the private network.
Other chat servers exposing `/v1/chat/completions` can also be configured.
Local refinement requires an explicit model name. When `REFINEMENT_PROVIDER` is
blank, it defaults to `TRANSCRIPTION_PROVIDER`. Local authentication is optional;
set the respective API key variables if your inference servers require bearer tokens.

Apply the settings:

```bash
docker compose up -d --build worker
```

The development Compose override maps `host.docker.internal` to the host gateway
on Linux. For a worker running directly on the host, use `localhost` instead.
In production Compose, use a reachable private server address or add the host
mapping explicitly. For servers on the same Docker network, use their service
names. Base URLs include `/v1`, not `/audio/transcriptions` or `/chat/completions`.

CPU transcription can take longer than the default 120-second job timeout.
Adjust `JOB_TIMEOUT_MS` for your hardware and recording length (the example uses
10 minutes). Errors and timeouts follow existing queue retries; Echo never falls
back to a cloud transcription provider automatically. Cancellation and shutdown
abort the HTTP request; server-side inference cancellation depends on the server.
