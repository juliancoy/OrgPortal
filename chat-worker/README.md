# Code Collective Chat Worker

Cloudflare-native chat backend for the portal. This worker is intentionally separate from the org worker because chat has different realtime, storage, and moderation concerns.

## Boundary

- `DB`: D1 database named `chat`, used for conversations, members, messages, attachments, and receipts.
- `CONTACTS_DB`: D1 database named `org`, used only to resolve public contact slugs into PIdP user IDs.
- `CHAT_ROOMS`: Durable Object namespace for active Cloudflare hibernating WebSocket fanout.
- `PIDP_BASE_URL`: PIdP base URL used for bearer-token authentication.

## Local Development

```sh
npm install
npm run db:migrate:local
npm run dev
```

## API

- `GET /health`
- `GET /api/network/chat/conversations`
- `POST /api/network/chat/dm`
- `GET /api/network/chat/conversations/:conversationId`
- `GET /api/network/chat/conversations/:conversationId/messages`
- `POST /api/network/chat/conversations/:conversationId/messages`
- `POST /api/network/chat/conversations/:conversationId/read`
- `GET /api/network/chat/conversations/:conversationId/socket`

All `/api/network/chat/*` routes require `Authorization: Bearer <pidp-token>`.

## Notes

The HTTP message endpoint is the durable write path. The Durable Object only broadcasts live events to connected clients through hibernating WebSockets. Clients should still fetch messages on load and after reconnects.
