# Personalized Google login entry

The portal login page renders Google's official Identity Services button using
the public `google_client_id` from PIdP `/configuration`. Google decides whether
to show an eligible signed-in account. GitHub retains its standard OAuth link.
If the configuration or Google script is unavailable, the standard Google OAuth
link remains available.

Before releasing, add `https://lifetech.fyi` (and other portal origins that use
the button) to the Google OAuth web client's **Authorized JavaScript origins**.
The existing PIdP OAuth callback stays the authorized redirect URI. Google
controls account personalization and it can vary with browser settings and
prior consent; the page cannot enumerate all provider sessions.

The button's credential is not used to authenticate in OrgPortal. Only its
numeric Google subject is passed as `login_hint` through PIdP SSO and into the
existing Google OAuth flow. PIdP validates OAuth state and exchanges the code
before mapping an identity or creating a session. Selecting an account starts
OAuth even when PIdP already has an application session; the return handoff
retains the portal account namespace and validated destination.

Release the matching Python/serverless PIdP changes separately before the portal
release. No credentials are stored in the browser by this entry point.

Reference: [Google personalized button](https://developers.google.com/identity/gsi/web/guides/personalized-button).
