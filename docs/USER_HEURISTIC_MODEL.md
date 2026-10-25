# User heuristic model for clickthrough analysis

The executable model is [model.json](../web/scripts/user-model/model.json). It describes assumed goals, not measured human behavior. Its personas are task roles; they do not infer age, disability, preferences or account permissions from personal characteristics.

## Analysis procedure

1. Select a persona, concrete goal, starting page, authentication/permission state and device/network conditions. Use a fresh browser context or explicitly record retained state.
2. State what a user should understand and expect before each action. Assess the visible label and surrounding information before consulting the implementation's destination. Record equally plausible alternatives and any unexplained portal terminology.
3. Follow a visible action using the intended input method. Record accessible name, route, observed state, errors, backtracks, required authentication and loss of tenant/task context. Never infer task success from HTTP 200, a changed URL or a screenshot alone.
4. Verify the task's required outcome evidence through browser assertions. A form must actually be visible; its event/tenant must match. Sign-in must return to the intended task. A successful save needs confirmation and persisted state. Writes belong in authorized isolated fixtures, not public live audits.
5. Review hierarchy, grouping and information scent against the intended reading order. Keep human judgments pending until someone examines the actual captures. Record each finding with the task, step, observation, impact, evidence and proposed correction.
6. Test recovery and an alternate condition where relevant. Distinguish a delayed response from a failed task; do not invent timing limits or assume a slow connection was tested.

## Roles and priorities

| Role | Primary question |
| --- | --- |
| First-time visitor | What is this event, when/where is it, and what can I do? |
| Organization applicant | How do I apply with my organization? |
| Guest applicant | Can I apply without creating an organization account? |
| Returning member | Will signing in restore my intended task? |
| Manager | Which controls configure the event, and was my change saved? |
| Keyboard user | Where is focus, and can I complete the same task? |

Keyboard operation and slow connections are cross-cutting conditions, not substitutes for the other task roles. A manager's permission must come from test setup, never from the persona label.

## Evidence and reporting

`reviewUserTask(page, taskId, parameters, evidence)` checks visible, enabled and uniquely named actions within a defined task scope and compares their destinations to the model. It encodes route parameters and rejects external/wrong destinations. The existing layout interaction runner invokes this before its application/submission checks at 320, 390 and 1440 pixels.

Its `user-heuristics.json` report distinguishes:

- `affordance-verified`: the modeled entry control is present and points to the expected route. It does not assert successful application or sign-in.
- `failed`: a modeled entry action is absent, ambiguous, hidden, disabled or misdirected.
- `destination-unverified`: required task-completion evidence is missing.
- `not-assessed`: no automated observer covers this task yet.
- Human review `pending`: no aesthetic or cognitive assessment has been inferred from automated checks.

Callers may supply outcome evidence only after asserting it in the journey. An evidence string is an assertion contract, not independent proof. The affordance observer supplies no completion evidence and deliberately reports those application outcomes as unverified. The separate application journey runner below verifies saves and recovery within its isolated fixtures. Visitor orientation, contextual sign-in, manager settings and keyboard section journeys remain unassessed by this integration. Light/dark captures exist separately; these affordance checks run at three widths in the fixture's default theme. Slow-network behavior is not covered.

Do not combine these categories into a percentage “usability score.” Report blockers (cannot proceed), major issues (wrong/ambiguous action or lost context), and minor issues (extra effort with a clear recovery), with evidence. Severity requires a task-specific judgment; it is not automatically assigned from a missing selector.

## Historical and UX basis

Read [the hierarchy review](EVENT_CONTROLS_UX.md). Relevant principles are reading order, consistent alignment, proximity, restrained emphasis and separation of administrative and attendee tasks. [NN/g's visual hierarchy guidance](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) explains grouping and emphasis; [GOV.UK button guidance](https://design-system.service.gov.uk/components/button/) supports explicit action labels. These guide analysis rather than prescribe LifeTech's visual identity.

## Run

```sh
cd web
node --test scripts/user-model/review.test.mjs
SUBMISSION_REVIEW_ONLY=1 npm run render:layouts -- ../artifacts/layout-review/user-heuristics
```

The existing distributed `visual` suite runs this same fixture runner and writes the report alongside its layout artifacts. A passing run establishes the checks it executed, not full usability or accessibility conformance.

## Application walkthrough and recovery

From `web`, run `node scripts/test-application-journeys.mjs`. The distributed `visual` suite runs it too, publishing `journeys.json` and selected mobile captures. It follows the real React application pages at 390 and 1440 pixels. Guest submissions use the actual Hono handler with an in-memory SQLite database; organization writes and identity are synthetic. It checks canonical guest routes, contextual sign-in entry, existing-organization defaults, save/reopen, receipt reload, duplicate-email validation, lost connections, server validation, retained entries and successful retry. No production records or emails are created. It does not verify the real OAuth round trip, provider delivery, guest account-linking browser flow or measured human hesitation.

Guest proposals remain private to organizers; organization proposals remain public for community voting. Both entry buttons explain this difference. Account linking after guest submission is optional and requires the same verified email; its confirmation explicitly creates a team and invites the supplied teammate. Receipt reload exposes status only, without returning private application details to an anonymous bearer of the receipt URL.

## Administrator MCP reconnect

The `mcp-admin-reconnect` task is exercised by
`PIdP/serverless/browser/mcp-admin-reconnect.mjs`. The distributed `identity`
catalog discovers `PIdP/serverless/test/mcp-browser.test.mjs`, which imports this
journey and the existing MCP consent browser tests.
It follows the visible administrator action with the keyboard, preserves OAuth
state and PKCE through the primary-account login handoff, checks administrator
consent, exchanges the code and verifies live introspection. Removing administrator
authority must revoke the elevated result and deny new administrator consent.
The existing distributed `org-api` organization profile test separately verifies
preview/apply, persisted edits without membership and denial for ordinary accounts.

Primary-account authentication is a synthetic fixture. The browser test uses real
PIdP OAuth handlers, local SQLite and intercepted brand images; it sends no live
credentials or writes. Its heuristic outcome remains distinct from pending human
review. ChatGPT's plugin discovery, Manage menu and reconnect controls are external
and remain unassessed; a passing run does not certify that external user journey.

## Sign in using another browser

The `mcp-other-browser` task runs in
`PIdP/serverless/browser/mcp-other-browser.mjs`, imported by the distributed
`identity` catalog through `test/mcp-browser.test.mjs`. Two isolated browser
contexts follow the visible **Use another browser** action, reject an incorrect
matching code, confirm the account and automatically advance the waiting browser
to permissions without an extra click or reload. The journey checks recovery from
a failed status request and immediate checking when the waiting tab becomes visible
with its interval timer paused. It asserts that no grant exists before explicit
**Allow access**, preserves OAuth state and PKCE, and verifies the confirmed identity
through token introspection. Pairing and browser-binding checks remain enforced.

Run `node --import tsx --test browser/mcp-other-browser.mjs` from
`PIdP/serverless`. Reports are written to `MCP_OTHER_BROWSER_ARTIFACTS` or
`/tmp/pidp-other-browser`. Identity cookies are synthetic; handlers and isolated
SQLite are real. These checks do not establish human usability or certify the
external ChatGPT interface. Human review remains pending.
