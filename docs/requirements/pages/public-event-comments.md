# Public Event Comments

## User Story

As a signed-in portal member viewing a public event page, I want to read and join the event conversation without leaving the event context, so that registration, attendance, and discussion all feel like one event experience.

## Primary Flow

1. The visitor opens `/events/:slug` on a tenant or local portal deployment.
2. The page loads public event details from the OrgPortal org API.
3. The page loads event registration and attendee preview state from the org API.
4. The page loads event comment metadata from the org API at `/api/network/events/public/:slug/chat`.
5. If comments are enabled and the visitor is signed in, the browser creates or joins the native event chat room through `/api/chat/api/network/chat/event-room`.
6. The browser loads the event chat messages through `/api/chat/api/network/chat/conversations/:conversationId/messages`.
7. The member posts a top-level comment.
8. The member replies to a comment.
9. The member reacts to a comment.
10. The event page shows the new comment, reply, and reaction without surfacing backend routing errors.

## Routing Contract

- Public event data, chat-room metadata, attendance, and registration belong to the org API and are requested through `/api/org`.
- Native chat room creation, messages, replies, reactions, reads, presence, and sockets belong to the chat API and are requested through `/api/chat`.
- Local development must preserve that split. `/api/chat/*` must proxy to `CHAT_API_ORIGIN`, not `ORG_API_ORIGIN`.
- A local unauthenticated event-room request may return `401 Unauthorized`; it must not return the org Worker catch-all `501 Endpoint is not implemented in the Cloudflare org worker`.

## Acceptance Criteria

- A signed-in member can open a public event with comments enabled and see the comment composer.
- The browser sends event-room creation to `/api/chat/api/network/chat/event-room` with the event ID, room title, and host organization ID.
- The browser never sends native chat writes to `/api/org` or bare `/api/network/chat` paths.
- Existing comments load from the chat API.
- Posting a comment appends it to the event page.
- Replying to a comment nests the reply under the root comment.
- Reacting to a comment displays the selected reaction and count.
- Registration and attendee preview remain visible on the same page.
- If authentication is missing, chat returns an authentication error rather than a 501 implementation error.

## Regression Tests

- `web/tests/e2e/tenant-routing.spec.ts` covers the signed-in event-page comment journey with mocked org, PIdP, and chat responses.
- `web/src/config/localProxy.test.ts` covers the local Vite proxy contract that `/api/chat` uses `CHAT_API_ORIGIN` independently from `ORG_API_ORIGIN`.
- `chat-worker/test/chat-worker.test.ts` covers the chat Worker event-room, comment, reply, and reaction backend behavior.
- `org-worker/test/org-worker.test.ts` covers the org Worker event comment metadata endpoint.
