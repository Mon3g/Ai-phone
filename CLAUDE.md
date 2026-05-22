# CLAUDE.md — Ai-phone

This file is the primary reference for AI assistants working in this repository. Read it before making changes.

---

## Project Overview

**Ai-phone** is a full-stack voice AI assistant that bridges Twilio phone calls to OpenAI's Realtime API. When someone calls a Twilio number, the backend loads the user's active "persona" (system prompt, voice, greeting) from Supabase, opens a bidirectional WebSocket to OpenAI, and streams audio in real time so the caller speaks directly with an AI voice agent.

### Core data flow
```
Caller → Twilio Voice → POST /incoming-call (TwiML) → WS /media-stream
                                                              ↕ (PCMU audio)
                                                     OpenAI Realtime API (wss)
```

The React frontend lets users manage personas, view call logs, and store their API credentials securely in Supabase.

---

## Repository Structure

```
Ai-phone/
├── index.js                  # Fastify server: all API routes + WebSocket media bridge
├── logger.js                 # Pino logger (stdout + file at ./logs/{NODE_ENV}.log)
├── package.json              # Root scripts, lint-staged config
├── docs/
│   └── backend-plan.md       # Planned modular refactor (not yet implemented)
├── supabase/
│   └── migrations/           # SQL migrations with timestamp-prefixed filenames
└── frontend/
    ├── package.json          # Frontend scripts
    ├── vite.config.js
    ├── tailwind.config.js
    ├── eslint.config.js
    └── src/
        ├── App.jsx           # React Router entry; defines all routes
        ├── main.jsx          # Vite entry point
        ├── pages/
        │   ├── Dashboard.jsx  # Stats cards + recent calls table
        │   ├── AIConfig.jsx   # Persona carousel, create/edit/activate forms (~520 lines)
        │   ├── APIKeys.jsx    # Credential management with show/hide toggles
        │   ├── CallLogs.jsx   # Searchable/filterable call history + CSV export
        │   └── Login.jsx      # Auth page (stub — see Known Gaps)
        ├── components/
        │   ├── Layout.jsx     # Sidebar shell, mobile nav, auth controls
        │   ├── PersonaCard.jsx
        │   ├── Modal.jsx      # Accessible dialog with focus trap + ESC close
        │   ├── AudioPlayer.jsx
        │   ├── FAB.jsx        # Floating action button (create persona)
        │   ├── PrivateRoute.jsx  # Auth guard (stub — see Known Gaps)
        │   └── ThemeToggle.jsx
        ├── context/
        │   └── ThemeContext.jsx  # Dark/light mode; toggles `dark` class on <html>
        └── lib/
            └── supabase.js    # Singleton Supabase client (anon key)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js 18+ (ES modules) |
| Backend framework | Fastify 5 + @fastify/websocket |
| Logging | Pino 9 |
| Phone / audio | Twilio SDK 4, Twilio Media Streams (PCMU audio) |
| AI voice | OpenAI Realtime API (`wss://api.openai.com/v1/realtime`) |
| Tunneling (local dev) | ngrok (@ngrok/ngrok) |
| Database / Auth | Supabase (PostgreSQL + RLS + JWT) |
| Frontend framework | React 19 + Vite 7 |
| Routing | React Router DOM 7 |
| Styling | Tailwind CSS 4 + PostCSS + Autoprefixer |
| Icons | Lucide React |
| Frontend DB client | @supabase/supabase-js |
| Linting / formatting | ESLint 9 (flat config), Prettier 3 |
| Git hooks | Husky + lint-staged |

---

## Development Commands

### Backend (run from repo root)
```bash
npm install                # Install backend dependencies
npm run dev                # Start server on port 5050 (node index.js)
npm run configure-twilio   # Configure Twilio webhook URLs via script
npm run format             # Prettier-format all *.{js,jsx,json,md,css}
npm run lint:frontend      # Run ESLint on the frontend
```

### Frontend (run from `frontend/`)
```bash
cd frontend
npm install
npm run dev        # Vite dev server (hot-reload)
npm run build      # Production build → frontend/dist/
npm run lint       # ESLint check
npm run preview    # Serve the production build locally
```

---

## Environment Variables

Create a `.env` file in the **repo root** for the backend:

```dotenv
# Required
OPENAI_API_KEY=sk-...

# Supabase (server-side — use service key, not anon key)
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Optional
NGROK_AUTHTOKEN=         # ngrok tunnel auth token
PORT=5050                # HTTP server port (default: 5050)
LOG_LEVEL=info           # Pino log level (default: info)
NODE_ENV=development     # Environment name
LOG_DIR=./logs           # Log file directory
```

Create a `.env` file in **`frontend/`** for the Vite build:

```dotenv
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Neither `.env` file is committed (both are in `.gitignore`).

---

## Key Architecture Patterns

### Backend

- **All code lives in `index.js`** — modularization is planned (`docs/backend-plan.md`) but not yet done. Resist splitting into files until that refactor is scoped.
- **Import the logger** from `./logger.js` — never use `console.log` in backend code.
  ```js
  import logger from './logger.js';
  logger.info({ callSid }, 'Call connected');
  ```
- **Auth on protected routes** uses `verifyAuth(request)` which validates the Supabase Bearer JWT:
  ```js
  const { user } = await verifyAuth(request);
  ```
- **WebSocket media bridge** at `/media-stream` manages two simultaneous WS connections (Twilio ↔ OpenAI). State is tracked per-connection in closure variables (`streamSid`, `markQueue`, `lastAssistantItem`).
- **Interrupt handling**: when `input_audio_buffer.speech_started` arrives from OpenAI, truncate the current response item and send `clear` to Twilio to stop buffered audio.
- **Persona activation**: only one persona may have `is_active = true` per user. The activate endpoint sets all others to `false` first, then sets the target to `true`.

### Frontend

- **Supabase client** is a singleton imported from `src/lib/supabase.js`. Never construct a new client inline.
- **Theme** is managed by `ThemeContext`. Wrap consumers with `useContext(ThemeContext)`. The context adds/removes the `dark` CSS class on `<html>`.
- **Design tokens** (Tailwind config):
  - Primary: purple — `#7c3aed` (`text-primary`, `bg-primary`)
  - Accent: green — `#10b981` (`text-accent`, `bg-accent`)
  - Neutrals: slate scale
  - Font: Inter with system fallback
- **Protected routes** wrap pages with `<PrivateRoute>`. Currently a stub — see Known Gaps.
- **Dirty state tracking**: `AIConfig.jsx` tracks whether a form is modified and warns before discarding changes. Replicate this pattern for any form that edits persisted data.
- **Audio preview** requests go to `POST /api/personas/:id/preview` (backend), which returns a base64-encoded WAV. `AudioPlayer.jsx` handles playback.

### Database

- All tables use `uuid` primary keys generated by `gen_random_uuid()`.
- Every table has a `user_id` column (FK to `auth.users`). Always filter queries by `user_id`.
- RLS is enabled — the frontend uses the anon key and relies on RLS policies. The backend uses the service key for admin operations only.
- New migrations go in `supabase/migrations/` with filename format `YYYYMMDDHHMMSS_description.sql`.
- The `assistant_settings` table has an `updated_at` trigger that auto-updates the timestamp.

---

## API Endpoints

| Method | Path | Auth Required | Description |
|--------|------|--------------|-------------|
| GET | `/` | — | Health string |
| GET | `/health` | — | Server uptime JSON |
| POST | `/incoming-call` | Twilio sig | TwiML response; loads active persona |
| WS | `/media-stream` | — | Twilio ↔ OpenAI real-time audio bridge |
| GET | `/api/personas` | Bearer JWT | List all personas for the authenticated user |
| POST | `/api/personas` | Bearer JWT | Create a new persona |
| PUT | `/api/personas/:id` | Bearer JWT | Update a persona |
| POST | `/api/personas/:id/activate` | Bearer JWT | Set as active persona (deactivates others) |
| POST | `/api/personas/:id/preview` | Bearer JWT | Generate and return a WAV audio preview |

---

## Code Conventions

- **ES modules only** — the root `package.json` sets `"type": "module"`. Use `import`/`export`; never `require()`.
- **No TypeScript** — backend is plain JS; frontend is JSX (not TSX).
- **No test suite** — `npm test` is a placeholder stub. Do not add tests without discussing scope first.
- **Pre-commit hooks** — Husky runs lint-staged on every commit. lint-staged runs `prettier --write` on all staged `*.{js,jsx,json,css,md}` files. Do not skip hooks.
- **No CI/CD** — there are no GitHub Actions workflows. Deployment is manual. The `/health` endpoint is the only uptime check.
- **Logging** — use Pino severity levels: `logger.info`, `logger.warn`, `logger.error`. Avoid logging sensitive values; the logger redacts the `authorization` header automatically.

---

## Database Schema Summary

### `assistant_settings`
Stores AI persona configuration per user.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | `gen_random_uuid()` |
| user_id | uuid FK | → `auth.users` |
| name | text | Persona label |
| system_message | text | AI personality prompt |
| voice | text | OpenAI voice ID (alloy, echo, fable, onyx, nova, shimmer) |
| temperature | decimal(3,2) | 0.0–1.0 |
| initial_greeting | text | First spoken message |
| enable_greeting | boolean | |
| openai_api_key | text | |
| twilio_account_sid | text | |
| twilio_auth_token | text | |
| twilio_phone_number | text | |
| ngrok_auth_token | text | |
| is_active | boolean | Only one true per user |
| created_at / updated_at | timestamptz | updated_at auto-managed by trigger |

### `call_logs`
Immutable record of each inbound call.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK | → `auth.users` |
| call_sid | text | Twilio call identifier |
| from_number / to_number | text | |
| duration | integer | Seconds |
| status | text | completed, in-progress, failed, initiated |
| started_at / ended_at | timestamptz | |
| transcript | text | Full call transcript |
| created_at | timestamptz | |

RLS policies on both tables allow authenticated users to SELECT/INSERT/UPDATE/DELETE only their own rows.

---

## Known Gaps (Work in Progress)

| Gap | Location | Notes |
|-----|----------|-------|
| Auth not enforced on frontend | `PrivateRoute.jsx`, `Login.jsx` | `PrivateRoute` renders children unconditionally; `Login` navigates to dashboard without calling Supabase auth |
| Backend is monolithic | `index.js` (630 lines) | Planned refactor into routes/services/plugins — see `docs/backend-plan.md` |
| No test suite | root `package.json` | `npm test` echoes an error string |
| No `.env.example` files | repo root + `frontend/` | Contributors must refer to this file for required variables |
| No CI/CD pipeline | `.github/` (absent) | No automated lint, build, or deploy |

When working on any of these gaps, align with the architecture described in `docs/backend-plan.md` before implementing.
