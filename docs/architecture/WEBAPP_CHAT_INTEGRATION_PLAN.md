# Webapp Chat Integration Plan (Matrix Backend)

## Goal
Implement the existing `webapp` chat user experience inside `OrgPortal`, while replacing custom chat transport/API calls with a Matrix-based backend.

## Scope
- Reuse and adapt chat UI/UX patterns from `webapp` (room list, room view, composer, unread state).
- Adapt `webapp` chat color styling to OrgPortal design tokens so chat feels visually consistent with OrgPortal while preserving readability/accessibility.
- Use Matrix (`matrix-js-sdk`) as the source of truth for room state, timeline, membership, receipts, and presence.
- Keep OrgPortal auth and role model (`SysAdmin`, `Org Admin`, `Member`, `Attendee`, `Public`) and enforce access in OrgPortal UI/API behavior.

Out of scope (phase 1):
- Full migration of historical custom-chat data.
- Cross-homeserver federation hardening.
- Full E2EE rollout for all rooms.

## Current State
- `webapp` has production chat UI and custom websocket/rest flows.
- Matrix server infrastructure exists in the platform (`synapse`), and `webapp` already contains Matrix client dependency/code.
- OrgPortal has role/access policy and org backend integration patterns that should gate admin-only behavior.

## Target Architecture
1. OrgPortal frontend
- Add a `ChatProvider` abstraction with a Matrix implementation.
- Move chat state management to Matrix sync stream and local cache.
- Keep presentational components mostly backend-agnostic.

2. Identity and session
- Primary login remains PIdP.
- Exchange authenticated user context for Matrix access (OIDC-backed flow or trusted token exchange service).
- Store Matrix session tokens securely (short-lived access token + refresh strategy).

3. Matrix backend
- Synapse as chat authority.
- Per-org room namespace conventions.
- Optional app-service/bot for admin automation (room provisioning, policy enforcement, moderation hooks).

4. Org backend responsibilities
- Keep org role truth in org backend.
- Do not duplicate message storage in org backend.

## Execution Plan

### Phase 0: Discovery and Mapping (1 week)
- Inventory all active `webapp` chat UI behaviors.
- Inventory `webapp` chat color usage (background, surface, primary action, status, unread, error).
- Define feature parity table:
  - Must have: room list, message timeline, send, read receipts, unread counts, membership changes.
  - Should have: typing, reactions, media upload.
  - Later: advanced moderation, threaded UX, full E2EE controls.
- Define canonical room naming and org scoping rules.
- Create color token mapping from `webapp` chat palette to OrgPortal token system (including dark-mode defaults).

Deliverables:
- Feature parity checklist.
- Room and permission mapping spec.
- Color mapping spec and contrast checklist.

### Phase 1: Matrix Adapter in OrgPortal (1-2 weeks)
- Introduce `ChatService` interface in OrgPortal.
- Implement `MatrixChatService` using `matrix-js-sdk`.
- Add sync lifecycle handling (initial sync, incremental sync, reconnect/backoff).
- Keep existing UI components; wire to adapter.

Deliverables:
- Working room list and room timeline from Matrix.
- Send message path working end-to-end.

### Phase 2: Auth and Access Integration (1 week)
- Implement login-to-Matrix session bootstrap flow.
- Implement role-aware access behavior in OrgPortal chat UX:
  - `SysAdmin`: platform admin controls in OrgPortal.
  - `Org Admin`: organization admin controls in OrgPortal.
  - `Member`: standard room participation UX.
  - `Attendee`/`Public`: constrained UX and room entry points.
- Ensure non-admins never see admin chat controls.

Deliverables:
- Auth bootstrap flow documented.
- Permission enforcement tests passing.

### Phase 3: UX Parity and Reliability (1-2 weeks)
- Add unread counters, receipts, typing indicators, optimistic send status.
- Add media upload and attachment rendering.
- Add offline/reconnect behavior and local cache restore.
- Apply final themed styling in OrgPortal:
  - Room list, message bubbles, composer, badges, and primary chat actions.
  - Prominent `#002a61` usage where appropriate in chat shell/layout backgrounds.
  - Ensure chat honors OrgPortal default theme behavior.

Deliverables:
- Feature parity checklist updated to >= 90% for target scope.
- Error/latency handling accepted in QA.
- Visual parity and accessibility sign-off (WCAG contrast on critical text/actions).

### Phase 4: Security and Hardening (1 week)
- Threat-model token handling and session expiry paths.
- Enforce least privilege for matrix admin operations.
- Add audit logs for room provisioning and moderation actions.
- Security review for E2EE rollout decision (enabled-by-default vs selected rooms).

Deliverables:
- Security checklist complete.
- Incident runbook for chat outages.

### Phase 5: Rollout and Migration (1 week)
- Dark launch in dev with internal users.
- Canary rollout by org.
- Cut over OrgPortal chat entry points.
- Keep rollback switch to disable Matrix adapter and hide chat UI if critical issues occur.

Deliverables:
- Production rollout checklist.
- Post-launch metrics and issue triage plan.

## Testing Strategy
- Unit tests:
  - Adapter methods (send, sync handling, membership updates).
  - Role-gated UI/API behavior helpers.
- Integration tests:
  - Synapse + OrgPortal in docker-compose.
  - Login bootstrap and room access by role class.
- E2E tests:
  - `Member` sends/reads in org room.
  - `Public` cannot access restricted rooms.
  - `Org Admin` can moderate org room.
  - `SysAdmin` can perform platform-level moderation.
- Visual regression/accessibility checks:
  - Chat color token rendering in OrgPortal themes.
  - Contrast checks for primary actions, unread markers, and status text.

## Deployment Plan
- Follow existing deployment discipline in [`org/DEPLOY.md`](/home/julian/Documents/arkavo-platform/org/DEPLOY.md):
  - Validate in dev first.
  - Restart/recreate affected containers when env or image changes.
  - Verify health checks and logs post-deploy.
- Add Synapse and OrgPortal chat smoke checks to deployment verification.

## Risks and Mitigations
- Auth/session mismatch: define one canonical token exchange path and test expiry/refresh aggressively.
- Sync performance at scale: paginate timelines and tune sync filters early.
- Feature regression during cutover: keep adapter boundary and fallback toggle.

## Definition of Done
- OrgPortal chat UX is functional on Matrix for target roles and core room flows.
- Admin visibility/actions are correctly role-gated.
- Automated tests cover auth, permissions, messaging, and reconnect behavior.
- Chat styling is adapted from `webapp` and aligned with OrgPortal tokens, including validated contrast/accessibility.
- Deployment and rollback runbooks are documented and validated in dev.
