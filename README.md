# OrgPortal

OrgPortal is the shared organization and community application used by
CodeCollective and tenant sites such as MedTech. `web/` owns the portal UI;
the organization, governance, and chat services own their domain workflows.
PIdP is a separate identity provider maintained in the sibling `../pidp`
checkout, not a vendored service in this repository.

## Account and Service Boundaries

These are ownership rules, not a claim that all migration work is complete.

| Capability | Source of truth and implementation owner |
| --- | --- |
| Credentials, social sign-in, identity verification, recovery, authentication sessions, and account security | PIdP |
| Stable identity subjects, core identity profile/avatar, and linked login providers | PIdP |
| OAuth client registration, PKCE, connected-app consent, tokens, refresh, and grant revocation | PIdP |
| Organizations, membership, invitations, roles, and domain authorization | OrgPortal |
| Member directories, organization-specific profiles/preferences, governance, chat, and event administration | OrgPortal |
| Personal calendar and event workflows, including event galleries | OrgPortal, using existing PIdP provider-credential/calendar interfaces where applicable |
| Tenant branding, navigation, sign-in entry points, and post-login application routing | OrgPortal |
| Medical datasets, taxonomy/strategy analysis, and public medical event presentation | MedTech |

Reusable account and security screens belong in PIdP. Portal account pages may
compose domain settings and link to PIdP-managed identity settings, but must not
implement another credential store, provider callback, recovery flow, or token
issuer. A branded portal sign-in entry point is appropriate; duplicating the
authentication implementation is not. Identity-profile edits use PIdP interfaces;
membership-profile edits stay in OrgPortal.

For MCP, the intended flow is: client -> PIdP authorization -> existing account
sign-in -> explicit PIdP consent -> client callback -> OrgPortal tools. Preserve
the requesting portal and its account namespace through sign-in. Never silently
substitute PIdP owner login for a portal website-user account. Portal sessions
and issuer sessions are not automatically interchangeable across domains; any
handoff must be validated and preserve OAuth state, exact redirects, and PKCE.

PIdP authenticates an identity and limits delegated scopes. OrgPortal independently
checks the mapped identity, current membership, domain permissions, and required
preview/apply receipts on each operation. OAuth consent does not create membership
or administrator access. Never infer privileged identity mappings from email.
Event gallery objects and metadata remain OrgPortal-owned, not identity assets.

The `/users/mcp-connect` route reuses the existing portal login and explicitly
confirms the account. PIdP exchanges its one-use, browser-bound handoff for a
resource-bound MCP browser session and then hosts consent. Configure the resource
mapping in PIdP; do not accept a client-supplied issuer or portal destination.
Move reusable account UI upstream incrementally while preserving existing
subjects and sessions, with integration tests before switching routes.

Shared portal releases go through the CodeCollective checkout. PIdP is released
separately, with equivalent account/OAuth behavior in Python and serverless.
MedTech deployment must not deploy either shared service.

See [architecture](ARCHITECTURE.md), [account authorization](../pidp/docs/account-oauth.md),
and [event uploads](docs/deployment/EVENT_UPLOADS.md).

## Historical Project Context

The ballot-sign material below records the original civic project context. Its
placeholder status statements do not describe the current OrgPortal platform.


## Intent Statement

This project exists to **build a production-grade, open-source platform** that improves how ballot initiatives are discovered, signed, and securely recorded in Washington, DC.

This repository is currently a placeholder only because the initial project team has not yet met. The intent is not exploratory tinkering or a speculative prototype. The intent is to do the serious legal, technical, and civic work required to design, validate, and implement a system that can operate within DC election law and earn public trust.

---

## Overview

This repository hosts an open-source civic technology project focused on modernizing the ballot initiative signing process in Washington, DC.

Today, ballot initiative campaigns rely heavily on door-to-door canvassing to collect signatures. While legally valid, this approach is inefficient, costly in volunteer time, and often uncomfortable for residents. Awareness of active ballot initiatives is also limited.

This project aims to address those challenges by creating a secure, accessible, and legally compliant digital platform that:

- Helps residents **discover active ballot initiatives**
- Enables eligible residents to **find and sign initiatives through a trusted digital workflow**
- **Securely records and maintains signature data** in alignment with DC election requirements

---

## Project Status

- The initial project team has **not yet convened**
- No architectural or technical decisions have been made
- Early work will begin at Civic Tech DC meetings in January
- Initial efforts will focus on:
  - Legal feasibility and requirements
  - System architecture and security considerations
  - Review of existing open-source ballot initiative platforms

This README will evolve as the project takes shape.

## Project docs

- Architecture contract: `ARCHITECTURE.md`
- Architecture recommendations: `docs/architecture/ARCHITECTURE_RECOMMENDATIONS.md`
- Frontend mockup recommendations: `docs/mockups/FRONTEND_MOCKUP_RECOMMENDATIONS.md`
- AWS deployment (static demo): `docs/deployment/AWS_DEPLOYMENT.md`
- Cloudflare + PIdP deployment: `docs/deployment/CLOUDFLARE_PIDP_DEPLOYMENT.md`
- Shared event providers and ChatGPT MCP setup: `docs/deployment/EVENTS_MCP.md`

---

## How to Get Involved

This is a multidisciplinary civic effort. We welcome contributors with backgrounds in:

- Software engineering (frontend, backend, security, infrastructure)
- UX and accessibility design
- Election law and public policy
- Civic engagement and campaign operations

**To get involved:**
- Join the `#ballot-sign` Slack channel in the Civic Tech DC Slack
- Introduce yourself and share what you’d like to contribute or learn

---

## Guiding Principles

- **Legitimacy first** — legal compliance is a core requirement
- **Security and auditability by design**
- **Accessibility for residents**
- **Transparency in process and governance**
- **Open source, open collaboration**

Ballot initiative signatures are not fully private by law. Any system built by this project will reflect that reality clearly and responsibly.

---

## Relationship to Civic Tech DC

This project is being developed within the Civic Tech DC community. It is not a closed startup and not a casual experiment. It is an open, serious attempt to build civic infrastructure that could meaningfully improve democratic participation in DC.

---

## Call to Action

If you’re interested in helping build this platform:

👉 Join the `#ballot-sign` Slack channel in Civic Tech DC and introduce yourself.
