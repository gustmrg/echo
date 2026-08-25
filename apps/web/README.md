# Echo Web

React 19 + Vite SPA for the Echo speech-to-text pipeline: record or import
audio, upload it to the .NET API for transcription, review/edit the
transcript, and refine it into a structured output format.

- TanStack Router (code-based routes) + TanStack Query
- Tailwind CSS v4 via `@tailwindcss/vite`
- Talks to the API through a dev proxy (`/api` → `http://localhost:5143`, see `vite.config.ts`)

Transcript edits and AI-refined outputs are stored in `localStorage`
(`src/lib/storage.ts`) and refinement responses are mocked (`src/mocks/refine.ts`)
until the API grows the matching endpoints.

```bash
npm install
npm run dev
```
