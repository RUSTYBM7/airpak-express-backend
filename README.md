# AirPak Express — Backend

Node.js + WebSocket backend for the AirPak Express global logistics
platform. Powers the REST API, the live bridge (chat, presence, typing),
Stripe payments, Airpak Coin settlement, and the AI support agent.

## Run

```bash
npm install
cp .env.example .env   # fill in real keys, or leave blank for mock mode
node src/server.js     # listens on http://localhost:3001
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | /health | liveness probe |
| POST | /api/auth/login | email + password sign-in (Supabase or mock) |
| POST | /api/auth/register | new account |
| GET | /api/shipments | list shipments |
| POST | /api/shipments | create shipment |
| GET | /api/shipments/:id | shipment detail |
| GET | /api/chat/messages?thread=:id | thread messages |
| POST | /api/chat/messages | post a user message |
| POST | /api/admin/chat/post | post an agent reply |
| GET | /api/live/online | online users + rooms |
| GET | /api/live/users | admin presence list |
| WS | /ws | live bridge (chat, presence, typing) |

## Environment

| Key | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP listen port |
| `SUPABASE_URL` | _empty_ | if set, switches to real Supabase auth |
| `SUPABASE_ANON_KEY` | _empty_ | Supabase anon key |
| `STRIPE_SECRET_KEY` | _empty_ | Stripe secret (mock mode if missing) |
| `OPENAI_API_KEY` / `AI_API_KEY` | _empty_ | OpenAI key for support agent (mock mode if missing) |
| `AI_MODEL` | `MiniMax-M3` | model identifier sent to OpenAI |

Mock mode means every endpoint returns realistic fake data and the
WebSocket broadcasts to subscribed clients. Perfect for local dev or
staging without provisioning real third-party accounts.
