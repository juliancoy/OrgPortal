# ChatGPT plugin reconnect mock review

The executable prototype is `PIdP/serverless/browser/fixtures/chatgpt-plugin.html`
in the sibling checkout. Open that HTML locally to explore the controls. The
standalone retry demonstrates feedback only; it cannot authenticate an account.
The real browser harness replaces that destination with isolated PIdP OAuth.

## Scope and evidence

Model tasks: `chatgpt-plugin-reconnect` and `mcp-admin-reconnect`; persona:
system administrator trying to reconnect and edit a group without membership.
The plugin detail and tool-list structure follow the two user-supplied screenshots.
Manage contents, connection failure and connected-account states are explicit
inferences. This is a design prototype, not a reverse-engineered ChatGPT client.

`PIdP/serverless/test/mcp-browser.test.mjs` runs the walkthrough through the
existing distributed identity catalog. It checks the app-row/tool-list detour,
Escape and restored focus, Manage/account controls, failed reconnect, cancellation
and retry, the actual PIdP consent handler, OAuth state and PKCE, switching from
an ordinary fixture account to an allowlisted primary account, live introspection,
a visible connected identity, authority removal and grant revocation. SQLite,
login and external branding are isolated fixtures; no production records change.

Captures are generated at 1440 and 390 pixels. The harness writes
`user-heuristics.json` and PNGs to `MCP_MOCK_ARTIFACTS` or
`/tmp/chatgpt-mock-review`. Artifact evidence contains synthetic accounts only.

## Findings

| Principle | Observation and impact | Assessment | Correction |
| --- | --- | --- | --- |
| Information scent | The app row repeats the plugin name but opens tools. A user seeking account settings can take the wrong route, as occurred in this conversation. | Major navigation ambiguity, supported by supplied screenshots and reproduced in the mock. | Label it “View tools”; expose “Manage connection” separately. |
| Information scent | “Manage” does not name the account/reconnect task. Its actual contents were not supplied. | Major ambiguity in the mocked journey; actual menu behavior remains unverified. | Prefer “Manage connection” or a visible “Reconnect account” action. |
| Recovery and keyboard | Escape closes the tool dialog and returns focus to its trigger. The mock explains where account controls live. | Passed browser assertions in the prototype. That explanatory hint is a proposal, not screenshot evidence. | Retain explicit escape and focus restoration. |
| Feedback and recovery | An injected connection interruption keeps the old account, explains the failure, and offers retry/cancel. | Passed fixture assertions; no real outage was induced. | Preserve the current connection until replacement succeeds. |
| Continuity | State and PKCE survive the admin login handoff; the account visibly changes to the fixture administrator. | Passed real isolated PIdP handler assertions. Primary sign-in itself is synthetic. | Keep the intended task and show the selected account before consent. |
| Feedback | A success badge appears only after live fixture introspection confirms admin authority. | Passed assertions. | Show account and access level rather than a generic “Connected.” |
| Hierarchy and responsive layout | Desktop/mobile captures keep identity, actions and details distinct; no horizontal overflow was observed. | Agent visual review of generated captures, not measured human usability. | Keep concise account feedback near connection actions. |

There is no aggregate usability score. Automated task completion is verified
only within the prototype. Human participant review, the real ChatGPT Manage
menu, real credentials, slow-network timing, full keyboard traversal and a group
save through this mock remain unassessed. The separate organization-profile test
covers persisted admin edits without membership; it is not a browser group-save
claim.

## Run

From `PIdP/serverless`:

```sh
node --import tsx --test test/mcp-browser.test.mjs
```

The distributed request should select that standard test file directly. Re-run
and inspect captures after prototype changes; do not infer actual ChatGPT UI
behavior from a passing mock.

The identity worker uses a bundled copy of the canonical OrgPortal model and
review helper under `browser/fixtures/user-model/`. Local runs compare both files
byte-for-byte when the OrgPortal checkout is present. The identity cache inputs
include the canonical model so changes invalidate historical results. This keeps
the browser job runnable when only its owning PIdP checkout is mounted.
