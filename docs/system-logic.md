# System Logic Overview

This document describes how the production-ready Node.js backend is structured, the major
runtime flows, and how the main components collaborate to serve voice calls and persona
management requests.

## High-Level Architecture

```
┌─────────────────────┐      ┌────────────────────────────┐
│ Environment config  │◄────►│  Bootstrap (`src/main.js`) │
└─────────────────────┘      └────────────┬───────────────┘
                                           │ wires dependencies
                                           ▼
                                   ┌──────────────┐
                                   │ Fastify App  │
                                   └────────┬─────┘
                       ┌────────────────────┴────────────────────┐
                       │                                         │
              ┌────────▼────────┐                      ┌─────────▼────────┐
              │ HTTP routes     │                      │ WebSocket routes │
              └──────┬──────────┘                      └────────┬─────────┘
                     │                                          │
     ┌───────────────▼────────────────┐          ┌──────────────▼──────────────┐
     │ Personas / Incoming call /     │          │ Twilio <-> OpenAI streaming │
     │ Health check endpoints         │          │ bridge (media stream)       │
     └────────────────────────────────┘          └─────────────────────────────┘
```

Supporting modules sit alongside the app:

- **`config/`** collects environment variables and shared defaults.
- **`integrations/`** wraps OpenAI Realtime and Supabase clients.
- **`services/`** implements business logic (currently persona operations).
- **`plugins/`** adds logging, parsers, and shared Fastify behaviour.
- **`tunneling/`** boots ngrok in development for Twilio webhooks.
- **`observability/`** contains the Pino logger configuration used app-wide.

The Fastify instance is dependency-injected with the logger, Supabase client, and
third-party integrations so route handlers stay thin and testable.

## Bootstrap Flow (`src/main.js`)

1. Load environment configuration and abort if mandatory settings (e.g. `OPENAI_API_KEY`)
   are missing.
2. Instantiate shared integrations:
   - Supabase client via `createSupabaseClient` for persona persistence and auth checks.
   - OpenAI Realtime client via `createOpenAiRealtimeClient` for persona previews and the
     media stream bridge.
3. Create the Fastify server with the above dependencies.
4. Register process-level error handlers and OS signal listeners.
5. Start listening on the configured port and optionally open an ngrok tunnel during
   development so Twilio webhooks can reach the machine.

## HTTP Route Logic

### Root (`GET /`)
A lightweight health check that confirms the server is alive. Useful for uptime monitors
and load balancer probes.

### Incoming Call (`ALL /incoming-call`)
1. Fetch the active persona from Supabase (if configured). On errors, log and fall back to
   defaults.
2. Build a TwiML `<Connect>` response that tells Twilio Voice to initiate a media stream to
   the backend's `/media-stream` WebSocket endpoint and optionally play persona-specific
   greeting text.
3. Return the XML payload to Twilio.

### Personas REST API (`/personas`)
This module delegates to `PersonaService` to enforce authentication and encapsulate Supabase
queries. Key flows:

- **List (`GET /personas`)** – read personas for the authenticated user. Returns `503` if
  Supabase is not configured.
- **Create (`POST /personas`)** – verify the Supabase session from the Fastify request,
  enrich payload with the creator's user ID, insert a record, and log the new persona ID.
- **Update (`PUT /personas/:id`)** – confirm the persona belongs to the user before
  applying updates.
- **Activate (`POST /personas/:id/activate`)** – mark all of the user's personas as inactive
  then set the chosen persona to active.
- **Active persona (`GET /personas/active`)** – fetch the single active persona for the
  authenticated user.
- **Preview (`POST /personas/:id/preview`)** – request a short audio clip from the OpenAI
  Realtime API using persona-specific voice and instructions.

Authentication uses the helper in `utils/auth.js`, which validates Supabase access tokens
present on the request.

## Media Stream Bridge (`GET /media-stream` over WebSocket)

This handler connects Twilio's bidirectional audio stream with the OpenAI Realtime API.
The lifecycle is:

1. When a Twilio client connects, log the remote address and create a parallel WebSocket to
   OpenAI using the configured voice, temperature, and system instructions.
2. After the OpenAI socket opens, send a `session.update` message to configure audio formats
   and conversation behaviour. Optionally seed the conversation with a starter prompt.
3. For every media frame from Twilio (`event: 'media'`), forward the base64 PCM payload to
   OpenAI using `input_audio_buffer.append` messages.
4. Track timing metadata from Twilio to calculate when to truncate an in-flight assistant
   response if the user speaks over it.
5. When OpenAI emits `response.output_audio.delta` events, stream the audio back to Twilio
   as `event: 'media'` messages and enqueue `mark` events so Twilio can play partial audio.
6. Handle `input_audio_buffer.speech_started` by truncating the assistant's previous audio
   so overlapping playback is avoided.
7. When either socket closes, shut down the peer connection and log diagnostics.

## Persona Preview Generation

The `OpenAiRealtimeClient` exposes `createPreviewAudio`, which is used by the persona
preview API. It establishes a short-lived OpenAI Realtime session, sends persona-specific
instructions and text, aggregates the streamed audio chunks, and returns a base64-encoded
WAV file for playback in the frontend.

Timeouts and cleanup logic ensure sockets are closed even if the OpenAI stream stalls or an
exception is thrown mid-flow.

## Error Handling & Observability

- Fastify log hooks (`plugins/loggingHooks.js`) add request/response correlation, surface
  validation errors, and ensure errors bubble with structured metadata.
- Process-level handlers capture unhandled promise rejections and uncaught exceptions,
  logging them via the shared Pino logger.
- Each integration and service logs significant lifecycle events (persona activation,
  OpenAI socket state changes) to aid production debugging.

## Development vs Production Considerations

- In development, ngrok can be enabled via `ENABLE_NGROK=true` to expose the local server to
  Twilio. In production, deploy behind a stable HTTPS endpoint (e.g. managed Node platform or
  container orchestrator) and disable ngrok.
- Environment-driven configuration keeps secrets out of the codebase and allows per-env
  tuning of model choice, temperature, and default voice.
- The modular structure (config, integrations, services, routes) supports unit testing and
  future expansion such as job queues, scheduled tasks, or additional providers.

