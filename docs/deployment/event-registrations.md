# Event registrations

Event detail pages collect registrations using the existing PIdP accounts. Visitors can log in or create an account and return to the event. They explicitly register after authentication. Each account has at most one registration per event and can cancel it.

The registration card displays the total count and up to eight public contact profiles, with profile photos or initials. Disabled/private profiles still count but are excluded from the preview. The public response omits account IDs, email addresses, and other contact fields. Calendar sync failure does not undo registration; cancellation does not delete external calendar copies.

## Deployment order

These changes require both the org worker and web frontend. Before deploying, review any other pending migrations in the target environment. Using the existing Cloudflare account, D1 binding, and deployment configuration:

1. From `org-worker`, install dependencies with `npm ci` and apply migrations with `npm run db:migrate:remote`. Migration `0018_event_registrations.sql` creates the registration table and index. Do not drop or recreate the existing database.
2. From `org-worker`, deploy with `npm run deploy`.
3. Build and release `web` through the existing frontend deployment pipeline with its normal base path and org API proxy configuration. The API proxy must forward `Authorization` and support GET, POST, and DELETE.

No new secrets or identity provider configuration are needed. This change does not submit registrations to external event providers such as Luma; these are portal registrations.

## API

`/api/network/events/:eventId/attendance` supports:

- GET: public count and profile preview; a valid bearer token additionally returns the requesting account's `registered` status.
- POST: authenticated, idempotent registration for the token's account.
- DELETE: authenticated, idempotent cancellation for the token's account only.

All responses disable caching. Successful responses contain `event_id`, `count`, `attendees` (`slug`, `name`, `photo_url`), and `registered`. Unknown events return 404. Missing or invalid credentials on writes return 401.

## Verification

Automated checks:

```sh
cd org-worker
npm run typecheck
node --import tsx --test test/*.test.ts
cd ../web
npm test -- src/ui/views/public/attendanceApi.test.ts
npm run build
```

After deployment, open an event while signed out, confirm its count is visible, and follow Sign up or Log in. Verify the flow returns to the event, registration updates the count, a reload preserves the status, repeat registration does not inflate the count, and cancellation reduces it. A registered account with an enabled public profile should appear in the preview; a private profile should not.

Rollback application code if needed, keeping the additive table and its registrations intact.
