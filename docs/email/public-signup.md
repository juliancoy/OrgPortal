# Organization mailing-list signup

Each organization has a public `/orgs/:handle/subscribe` page. Its public profile
links to this page, and configured tenant sites show a mail icon beside their
social shortcuts. Labels and destinations come from the organization record.
Visitors explicitly enter an email address and consent; no login, account or
organization membership is created.

The page calls `POST /api/email/newsletter/:organizationId` through the portal
API proxy. The configured central portal may host any organization signup;
registered tenant and attached-domain origins may subscribe only to their own
organization. IDs supplied in the body do not select another organization.
The older LifeTech embed endpoint remains compatible.

This reuses `email_subscriptions`, existing unsubscribe and suppression rules,
rate limiting and the existing personal-data lifecycle. Anonymous signup never
reactivates an opt-out, clears a bounce or reveals existing subscriptions.
No email is sent by signup itself. Existing campaign authorization and reviewed
sending remain separate.

Checks: `src/data/newsletterSignup.test.ts`, the newsletter cases in
`org-worker/test/email-campaigns.test.ts`, and
`node web/scripts/review-newsletter-signup.mjs` against the isolated local Docker
gateway. The browser review uses synthetic organizations and intercepted API
responses; the API tests exercise the actual SQLite subscription rules.
