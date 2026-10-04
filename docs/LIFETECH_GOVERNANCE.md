# LifeTech Constitution and change tickets

LifeTech onboarding links to `/governance/documents/lifetech-constitution`.
The document adapts the Code Collective draft at
<https://codecollective.us/constitution>, also present in the sibling
`CodeCollective/constitution.html`. It retains all nine titles and their main
subsections. It changes the mission, skills, event activities, contacts, and
channels for LifeTech, and corrects the duplicated final title number to IX.
It starts explicitly unratified and changes status only through the ratification
workflow below. No legal status, fiscal host, officeholder,
or new contact address is asserted.

## Participation and procedure

The organization with slug `lifetech` supplies the existing membership boundary.
Active members may propose exact-text replacements and discuss them. Per the
requested policy, only active owners and administrators (organizers) second and
vote. Onboarding completion does not grant membership or an organizer role.

Tickets reuse `governance_motions`, `governance_votes`, `governance_comments`,
organization IAM, and the governance preview/apply receipt service. They are not
a separate MedTech governance service. Raw mutation endpoints cannot bypass the
receipt requirement for document tickets. The browser reviews each operation
before confirming it; MCP can use the same proposal and action schemas.

The workflow is proposal, second by another organizer, chair recognition,
discussion, ballot, and resolution. Constitutional changes require seven full
days of exact-text notice and a ballot open for 24 hours. The chair records that
notice was delivered to all organizers and debate is exhausted. Delivery is a
chair responsibility; this feature does not send email or claim notification
was automatically delivered.

The ballot snapshots the active organizer roll. Its quorum is a majority of
that roll, counting explicit abstention as electronic participation. Passage
requires at least two thirds of yes/no votes and at least one yes. There is no
rounding down or extra chair tie-breaker. Only a currently active organizer on
the snapshot may vote. A changed organizer roll invalidates the result and
requires a newly noticed ticket. Ballots cannot be cast after the deadline or
resolved before it. Passed changes create a new revision only if the base
revision is still current; otherwise the vote remains recorded and a rebased
ticket is required.

## Parliamentary scope

The source explicitly called for review against Robert's Rules. The adaptation
uses the official FAQ at <https://robertsrules.com/frequently-asked-questions/>
for majority, two-thirds, abstentions, the chair's vote, and the distinction
between debate closure and tabling.

Asynchronous ballots and the participation quorum are **proposed special rules**
in this unratified draft, not a claim that Robert's Rules automatically permits
online polls. Adopting a draft edit is not ratification. Chair recognition and
typed procedural records do not prove that a real meeting had quorum, notice,
or exhausted debate.

The interface handles exact-text constitutional change tickets. Nested
amendments, the Previous Question, appeals, assembly withdrawal, and tabling
require a chaired meeting and recorded proceedings. An organizer cannot use
this interface to unilaterally cut off debate or table a constitutional ticket.
The proposer may withdraw only before a second. Proposed changes to the voting
rules themselves do not reconfigure software rules; review and update the
implementation before putting a newly adopted procedural rule into operation.

## Ratification pathway

The Constitution page has a readiness checklist and a separate organizer-only
ratification form. Finish open change tickets first. Identify the prior
organizing meeting or resolution that independently authorized the procedure:
organizer voting, majority participation quorum, two-thirds approval, seven full
days of notice, and a 24-hour electronic ballot. The draft does not authorize
its own ratification procedure. The chair attests to this prior authority; the
portal records that statement rather than independently verifying meeting minutes.

A ratification ticket captures all nine titles and their revision and SHA-256
hash. The preview receipt includes the hash of the text the organizer reviewed.
It does not replace a title or create an amendment. Database constraints prevent
concurrent ratification tickets and freeze new change tickets and accepted
revisions while the candidate is pending. Comments remain available.

A different organizer seconds the motion. The chair states the question and
records notice delivery with confirmation of the prior procedural agreement.
The seven-day period begins at that recorded notice, not at ticket creation.
After notice and debate, the existing organizer ballot and quorum checks apply.
A changed candidate or organizer roll prevents adoption. Failed or withdrawn
ratification leaves the document a draft and unlocks drafting; withdrawal after
a second still requires the assembly procedure already described above.

On passage, one atomic operation records the full adopted text, original
revision, ticket, text hash, authority record, adoption timestamp and immediate
effective date. The Constitution page displays **Ratified constitution** and
links to the adoption record. The original text remains available after later
amendments. Amendments use the existing versioned procedure and preserve the
initial ratification record; they do not restart whole-document ratification.
This is organizational recordkeeping, not automatic legal incorporation.

## Validation and release

Apply `0055_governance_documents.sql` and `0056_constitution_ratification.sql`
through the shared OrgPortal migration
path. This adds document metadata to existing motions, revision storage, and
procedure events. No production migration or deployment is performed by the
local acceptance tests.

From `org-worker`:

```sh
npm run typecheck
node --import tsx --test test/governance-documents.test.ts test/governance-mcp.test.ts
```

With the local Docker stack and local onboarding tenant configured, run:

```sh
python web/scripts/test-local-governance-documents.py
python web/scripts/test-local-onboarding.py
```

Python Playwright and local Chrome are required. The governance browser test
creates local identities, verifies their email using the local PIdP delivery
log, seeds only their local membership roles, and exercises the real APIs and
UI. It advances only its own ticket timestamps to test the ballot without
waiting eight days, then removes its tickets, revisions, ratification record, and role fixtures.
The browser test does not leave the real local Constitution ratified.
No API responses or ballot results are mocked. Screenshots are under
`.local/session-test/`.

Shared portal release belongs in CodeCollective. MedTech deployment must not
release OrgPortal, PIdP, or governance services.

## Section editing and suggested text

Each title has an inline section editor for active members. Saving goes through
change-ticket preview/apply and organizer approval. Ratification freezes these
edit controls along with the existing proposal form.

The draft displays one selected pending proposal per section: green underlined
additions and red struck-through deletions. Hover text identifies the proposer,
submission time, status, original revision, reason, and section ticket history.
Colored edits are keyboard buttons; activating one opens history, also available
through the section's history disclosure on touch devices. History retains
closed tickets and their original/proposed diffs, with links to the procedural
record. It currently reflects the API's 200 most recent document tickets.
Proposals against an earlier revision appear in history rather than being
silently applied to newer text. Readers can switch between competing proposals
or view the current text without suggestions.
