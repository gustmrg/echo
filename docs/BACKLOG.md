# Echo — Product Backlog

> **Version:** 1.0  
> **Last updated:** February 28, 2026  
> **Methodology:** Items organized by milestone, prioritized using MoSCoW

---

## How to read this backlog

Each item follows this format:

- **ID** — unique identifier (`ECH-XXX`)
- **Feature** — parent feature area (F1–F8)
- **Priority** — Must / Should / Could / Won't (for this release)
- **Size** — T-shirt estimate: S (< 1 day), M (1–3 days), L (3–5 days), XL (5+ days)
- **Status** — `todo` | `in-progress` | `done`

---

## Milestone 1: Foundation (Weeks 1–2)

> Goal: Project scaffolding, authentication, database setup, and core layout.

| ID | Title | Feature | Priority | Size | Status |
|----|-------|---------|----------|------|--------|
| ECH-001 | Initialize TanStack Start project with Vite and TypeScript | — | Must | S | todo |
| ECH-002 | Configure Tailwind CSS and base design tokens (colors, spacing, typography) | — | Must | S | todo |
| ECH-003 | Set up file-based routing with root layout (header, nav, main content area) | — | Must | S | todo |
| ECH-004 | Configure T3Env for type-safe environment variables | — | Must | S | todo |
| ECH-005 | Set up ESLint + Prettier with TanStack config | — | Must | S | todo |
| ECH-006 | Configure Vitest with initial smoke test | — | Must | S | todo |
| ECH-007 | Integrate Better Auth in stateless mode (email/password) | F6 | Must | M | todo |
| ECH-008 | Create sign-up page with form validation | F6 | Must | M | todo |
| ECH-009 | Create login page with form validation | F6 | Must | M | todo |
| ECH-010 | Implement session management with HTTP-only cookies | F6 | Must | M | todo |
| ECH-011 | Add route guards for protected pages (redirect to login) | F6 | Must | S | todo |
| ECH-012 | Set up PostgreSQL connection with Drizzle ORM | F8 | Should | M | todo |
| ECH-013 | Define database schema: User, Recording, Transcript, Output tables | F8 | Should | M | todo |
| ECH-014 | Run initial database migrations via Better Auth CLI + Drizzle Kit | F8 | Should | S | todo |
| ECH-015 | Create shared UI components: Button, Card, Input, Loading spinner | — | Must | M | todo |
| ECH-016 | Build app shell layout: sidebar/header navigation, responsive container | — | Must | M | todo |

---

## Milestone 2: Audio Capture (Weeks 3–4)

> Goal: Record audio in the browser and import audio files.

| ID | Title | Feature | Priority | Size | Status |
|----|-------|---------|----------|------|--------|
| ECH-017 | Create recording screen with large record button and timer display | F1 | Must | M | todo |
| ECH-018 | Implement MediaRecorder integration: start, pause, resume, stop | F1 | Must | L | todo |
| ECH-019 | Accumulate audio chunks into a single Blob on stop | F1 | Must | S | todo |
| ECH-020 | Add waveform visualization using AnalyserNode during recording | F1 | Should | M | todo |
| ECH-021 | Implement file import with drag-and-drop and click-to-browse | F1 | Must | M | todo |
| ECH-022 | Validate imported files: format check (MP3, WAV, M4A, WebM, OGG) and size limit | F1 | Must | S | todo |
| ECH-023 | Display audio preview/playback after recording or import | F1 | Should | M | todo |
| ECH-024 | Add browser compatibility detection for MediaRecorder API | F1 | Should | S | todo |
| ECH-025 | Handle microphone permission denial with user-friendly guidance | F1 | Must | S | todo |
| ECH-026 | Store recording metadata in database (userId, duration, status) | F1, F8 | Should | M | todo |
| ECH-027 | Write unit tests for audio capture utility functions | F1 | Must | S | todo |

---

## Milestone 3: Transcription (Weeks 5–6)

> Goal: Send audio to Whisper, display raw transcript, and allow editing.

| ID | Title | Feature | Priority | Size | Status |
|----|-------|---------|----------|------|--------|
| ECH-028 | Create server function for Whisper API: receive audio, call API, return text | F2 | Must | L | todo |
| ECH-029 | Implement multipart file upload from client to server function | F2 | Must | M | todo |
| ECH-030 | Add transcription progress UI: uploading → processing → complete states | F2 | Must | M | todo |
| ECH-031 | Handle Whisper API errors: timeout, rate limit, invalid audio, network failure | F2 | Must | M | todo |
| ECH-032 | Build review screen with editable textarea for raw transcript | F3 | Must | M | todo |
| ECH-033 | Add undo/redo support in transcript editor | F3 | Must | S | todo |
| ECH-034 | Display word count and estimated reading time | F3 | Could | S | todo |
| ECH-035 | Auto-save edited transcript to React state (debounced) | F3 | Must | S | todo |
| ECH-036 | Persist transcript (raw + edited) to database via server function | F3, F8 | Should | M | todo |
| ECH-037 | Add navigation guard warning about unsaved edits | F3 | Should | S | todo |
| ECH-038 | Add retry button for failed transcriptions | F2 | Must | S | todo |
| ECH-039 | Write integration tests for transcription server function | F2 | Must | M | todo |

---

## Milestone 4: AI Refinement (Weeks 7–8)

> Goal: Let users choose an output format and refine transcripts with Claude.

| ID | Title | Feature | Priority | Size | Status |
|----|-------|---------|----------|------|--------|
| ECH-040 | Build format selection screen with card-based picker (Blog, Interview, Notes, News) | F4 | Must | M | todo |
| ECH-041 | Design and write system prompt template for Blog Post format | F4 | Must | M | todo |
| ECH-042 | Design and write system prompt template for Interview format | F4 | Must | M | todo |
| ECH-043 | Design and write system prompt template for Notes format | F4 | Must | M | todo |
| ECH-044 | Design and write system prompt template for News Brief format | F4 | Must | M | todo |
| ECH-045 | Create server function for Claude API: receive transcript + format, return refined text | F4 | Must | L | todo |
| ECH-046 | Add refinement progress UI with processing indicator | F4 | Must | S | todo |
| ECH-047 | Handle Claude API errors: timeout, rate limit, content policy, network | F4 | Must | M | todo |
| ECH-048 | Enable re-processing: switch format and re-run refinement on same transcript | F4 | Must | S | todo |
| ECH-049 | Persist refined output to database (transcriptId, format, content) | F4, F8 | Should | M | todo |
| ECH-050 | Write unit tests for prompt construction logic | F4 | Must | S | todo |
| ECH-051 | Write integration tests for refinement server function | F4 | Must | M | todo |

---

## Milestone 5: Polish & Export (Weeks 9–10)

> Goal: Output display, export options, dashboard, and end-to-end testing.

| ID | Title | Feature | Priority | Size | Status |
|----|-------|---------|----------|------|--------|
| ECH-052 | Build output screen with formatted preview (respects headings, paragraphs, lists) | F5 | Must | M | todo |
| ECH-053 | Implement copy-to-clipboard button with success toast notification | F5 | Must | S | todo |
| ECH-054 | Implement download as `.txt` file | F5 | Must | S | todo |
| ECH-055 | Implement download as `.md` file | F5 | Should | S | todo |
| ECH-056 | Add "Re-process" button linking back to format selection | F5 | Must | S | todo |
| ECH-057 | Build dashboard page: list of recent recordings with status badges | F7 | Should | L | todo |
| ECH-058 | Add quick actions on dashboard: continue editing, view output, delete | F7 | Should | M | todo |
| ECH-059 | Implement recording deletion with confirmation dialog | F7 | Should | S | todo |
| ECH-060 | Add empty state for dashboard (no recordings yet) | F7 | Should | S | todo |
| ECH-061 | Write end-to-end test: full workflow from recording to export | — | Must | L | todo |
| ECH-062 | Accessibility audit: keyboard navigation, ARIA labels, focus management | — | Must | M | todo |
| ECH-063 | Responsive design pass: test and fix layouts on mobile, tablet, desktop | — | Must | M | todo |

---

## Milestone 6: Launch (Weeks 11–12)

> Goal: Production build, deployment, monitoring, and feedback.

| ID | Title | Feature | Priority | Size | Status |
|----|-------|---------|----------|------|--------|
| ECH-064 | Configure production build with Vite optimizations (code splitting, minification) | — | Must | M | todo |
| ECH-065 | Set up deployment pipeline (hosting provider TBD) | — | Must | L | todo |
| ECH-066 | Configure environment variables for production (API keys, DB URL, auth secret) | — | Must | S | todo |
| ECH-067 | Add error monitoring and logging (e.g., Sentry or similar) | — | Should | M | todo |
| ECH-068 | Add basic analytics: page views, workflow completion rate, format usage | — | Should | M | todo |
| ECH-069 | Create user feedback mechanism (in-app form or thumbs up/down) | — | Could | M | todo |
| ECH-070 | Write API usage documentation for server functions | — | Should | M | todo |
| ECH-071 | Performance audit: Lighthouse score, bundle size, API response times | — | Must | M | todo |
| ECH-072 | Security review: CSRF protection, input sanitization, HTTPS enforcement | — | Must | M | todo |
| ECH-073 | Final QA pass and bug fixes | — | Must | L | todo |

---

## Future Backlog (Post-Launch)

> These items are out of scope for v1.0 but tracked for future planning.

| ID | Title | Feature | Priority | Size |
|----|-------|---------|----------|------|
| ECH-100 | OAuth social login: Google and GitHub | F6 | Should | L |
| ECH-101 | Guest mode: limited usage without account creation | F6 | Could | M |
| ECH-102 | Real-time streaming transcription during recording | F2 | Could | XL |
| ECH-103 | Speaker diarization: auto-identify and label speakers | F2 | Could | XL |
| ECH-104 | Custom AI prompt templates: user-defined output formats | F4 | Could | L |
| ECH-105 | Audio playback synced with transcript highlighting | F3 | Should | L |
| ECH-106 | Team workspaces: shared recordings and collaborative review | F7 | Could | XL |
| ECH-107 | Integration APIs: webhooks for CMS and publishing platforms | F5 | Could | XL |
| ECH-108 | Progressive Web App: offline recording and editing | F1 | Could | XL |
| ECH-109 | Multi-language UI localization | — | Could | L |
| ECH-110 | Long-form audio support (60+ minutes) with chunked processing | F2 | Should | L |
| ECH-111 | Search and filter past recordings by keyword or date | F7 | Should | M |
| ECH-112 | Rich text editor for transcript review (bold, headings, lists) | F3 | Could | L |
| ECH-113 | Export to Google Docs / Notion / WordPress | F5 | Could | L |
| ECH-114 | Usage analytics dashboard: API costs, transcription volume | — | Could | M |

---

## Summary

| Milestone | Items | Must Have | Should Have | Could Have |
|-----------|-------|-----------|-------------|------------|
| M1: Foundation | 16 | 12 | 3 | 0 |
| M2: Audio Capture | 11 | 7 | 4 | 0 |
| M3: Transcription | 12 | 8 | 3 | 1 |
| M4: AI Refinement | 12 | 9 | 2 | 0 |
| M5: Polish & Export | 12 | 7 | 5 | 0 |
| M6: Launch | 10 | 5 | 3 | 1 |
| **Total v1.0** | **73** | **48** | **20** | **2** |
| Future | 15 | 0 | 3 | 12 |
