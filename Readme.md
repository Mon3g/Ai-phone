# Speech Assistant with Twilio Voice and the OpenAI Realtime API (Node.js)

This application demonstrates how to use Node.js, [Twilio Voice](https://www.twilio.com/docs/voice) and [Media Streams](https://www.twilio.com/docs/voice/media-streams), and [OpenAI's Realtime API](https://platform.openai.com/docs/) to make a phone call to speak with an AI Assistant.

The application opens websockets with the OpenAI Realtime API and Twilio, and sends voice audio from one to the other to enable a two-way conversation.

See [here](https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-node) for a tutorial overview of the code.

This application uses the following Twilio products in conjuction with OpenAI's Realtime API:

- Voice (and TwiML, Media Streams)
- Phone Numbers

> [!NOTE]
> Outbound calling is beyond the scope of this app. However, we demoed [one way to do it here](https://www.twilio.com/en-us/blog/outbound-calls-node-openai-realtime-api-voice).

## Prerequisites

To use the app, you will need:

- **Node.js 18+** We used \`18.20.4\` for development; download from [here](https://nodejs.org/).
- **A Twilio account.** You can sign up for a free trial [here](https://www.twilio.com/try-twilio).
- **A Twilio number with _Voice_ capabilities.** [Here are instructions](https://help.twilio.com/articles/223135247-How-to-Search-for-and-Buy-a-Twilio-Phone-Number-from-Console) to purchase a phone number.
- **An OpenAI account and an OpenAI API Key.** You can sign up [here](https://platform.openai.com/).
  - **OpenAI Realtime API access.**

## Local Setup

There are 4 required steps to get the app up-and-running locally for development and testing:

1. Run ngrok or another tunneling solution to expose your local server to the internet for testing. Download ngrok [here](https://ngrok.com/).
2. Install the packages
3. Twilio setup
4. Update the .env file

### Open an ngrok tunnel

When developing & testing locally, you'll need to open a tunnel to forward requests to your local development server. These instructions use ngrok.

Open a Terminal and run:

```
ngrok http 5050
```

Once the tunnel has been opened, copy the `Forwarding` URL. It will look something like: `https://[your-ngrok-subdomain].ngrok.app`. You will
need this when configuring your Twilio number setup.

Note that the `ngrok` command above forwards to a development server running on port `5050`, which is the default port configured in this application. If
you override the `PORT` environment variable (see `src/config/env.js`), you will need to update the `ngrok` command accordingly.

Keep in mind that each time you run the `ngrok http` command, a new URL will be created, and you'll need to update it everywhere it is referenced below.

### Install required packages

Open a Terminal and run:

```
npm install
```

### Twilio setup

#### Point a Phone Number to your ngrok URL

In the [Twilio Console](https://console.twilio.com/), go to **Phone Numbers** > **Manage** > **Active Numbers** and click on the additional phone number you purchased for this app in the **Prerequisites**.

In your Phone Number configuration settings, update the first **A call comes in** dropdown to **Webhook**, and paste your ngrok forwarding URL (referenced above), followed by `/incoming-call`. For example, `https://[your-ngrok-subdomain].ngrok.app/incoming-call`. Then, click **Save configuration**.

### Update the .env file

Create a `/env` file, or copy the `.env.example` file to `.env`:

```
cp .env.example .env
```

In the .env file, update the `OPENAI_API_KEY` to your OpenAI API key from the **Prerequisites**.

## Run the app

## Secrets & environment

Do NOT commit real secret values to the repository. Use the provided `.env.example` files as templates.

Root env (server):

```bash
cp .env.example .env
# then edit .env and paste your keys
```

Frontend env (client):

```bash
cd frontend
cp .env.example .env
# then edit frontend/.env and paste VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

If you accidentally committed secrets, rotate/revoke them and consider removing them from git history (BFG/git-filter-repo) — contact me if you want automated help.

Once ngrok is running, dependencies are installed, Twilio is configured properly, and the `.env` is set up, run the dev server with the following command:

```
npm run dev
```

## Test the app

With the development server running, call the phone number you purchased in the **Prerequisites**. After the introduction, you should be able to talk to the AI Assistant. Have fun!

## Special features

### Have the AI speak first

To have the AI voice assistant talk before the user, uncomment the line `// sendInitialConversationItem();`. The initial greeting is controlled in `sendInitialConversationItem`.

### Interrupt handling/AI preemption

When the user speaks and OpenAI sends `input_audio_buffer.speech_started`, the code will clear the Twilio Media Streams buffer and send OpenAI `conversation.item.truncate`.

Depending on your application's needs, you may want to use the [`input_audio_buffer.speech_stopped`](https://platform.openai.com/docs/api-reference/realtime-server-events/input_audio_buffer/speech_stopped) event, instead.

## AI persona operations

The backend now exposes a dedicated persona service (`src/services/personaService.js`) that encapsulates the business logic for managing AI profiles. Each persona can be created, updated, activated, and previewed through the REST API, while the service coordinates Supabase persistence and the OpenAI Realtime preview client.

Key endpoints:

- `GET /api/personas` — list every persona (admin/service usage)
- `POST /api/personas` — create a persona tied to the authenticated Supabase user
- `PUT /api/personas/:id` — update an existing persona (ownership enforced)
- `POST /api/personas/:id/activate` — mark the persona active for the calling user
- `GET /api/personas/active` — retrieve the active persona for the current user (useful for UI defaulting/configuring calls)
- `POST /api/personas/:id/preview` — trigger an OpenAI Realtime preview and return base64 WAV audio

For the preview workflow, the new `OpenAiRealtimeClient` (see `src/integrations/openaiRealtime.js`) handles the WebSocket exchange so that routes remain thin and the integration can be swapped or mocked in tests.

## Backend logic overview

If you need a deeper dive into how the modules fit together, check out
[`docs/system-logic.md`](docs/system-logic.md). It walks through the bootstrap sequence,
route/service responsibilities, the Twilio⇄OpenAI streaming bridge, and production
considerations so you can reason about end-to-end request flow when extending the system.
