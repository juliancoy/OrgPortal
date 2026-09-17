# Agent Notes

- The PIdP source is not a submodule of this repository. Use the sibling checkout at `../pidp` when you need to inspect or change PIdP code.
- Do not re-add `pidp/` or `PIdP/` as submodules. Keep OrgPortal changes in this repository and PIdP changes in `../pidp`.

## Account ownership

- Follow the ownership contract in `README.md`. PIdP owns credentials, social
  login/callbacks, identity verification/recovery, sessions, core identity data,
  account security, and OAuth registration/consent/token/revocation behavior.
- OrgPortal owns membership, invitations, organization roles and permissions,
  member profiles, governance, chat, calendars, events, and event galleries.
  Preserve existing provider-integration interfaces; do not duplicate adapters.
- Keep tenant branding, sign-in entry points, and application routing here.
  Reusable authentication/security UI belongs upstream in PIdP; portal account
  views compose domain settings and delegate identity operations to PIdP.
- Preserve the portal's account namespace and validated return context through
  OAuth. Do not route website users through owner login or assume cookies work
  across origins. Never create privileged identity mappings from email.
- PIdP scopes/consent do not grant membership or domain permissions. Check live
  OrgPortal permissions and required preview/apply receipts for API and MCP alike.
- Shared portal releases use CodeCollective. PIdP releases are separate and must
  preserve Python/serverless parity. Do not deploy shared services from MedTech.
