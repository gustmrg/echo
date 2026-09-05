# Echo web

React/Vite frontend for capture, transcription review, and saved AI refinement.
Use Node 24+ and pnpm 10.34.5 (the lockfile is `pnpm-lock.yaml`).

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm lint
pnpm build
```

Vite preserves `/api` and forwards to `http://localhost:5143`. For Docker Compose,
use `API_PROXY_TARGET=http://localhost:8080 pnpm dev`.

For the full-stack browser test, first run `dotnet tool restore` and
`dotnet test apps/api/Echo.slnx` from the repository root and install worker
dependencies. Then run `pnpm exec playwright install chromium` and
`pnpm test:e2e` here. The harness uses temporary files, the real API and worker,
and a local provider stub; no provider keys or paid requests are needed.
