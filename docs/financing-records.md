# Financing evidence and eventually consistent views

The authoritative OrgPortal D1 database stores financing events, recipients,
agency relationships and audit coverage. Public pages read API projections;
checked-in JSON is reviewed import input, never the live source of totals.
These are reported external financing records, not settled portal payments.

Each financing event has a stable ID, source URLs, announcement date, amount,
amount qualifier, type and reported investors. Agency contributions are separate
from whole rounds. `included_in_event_id` links a known contribution to its round.
Repeated announcements must reuse an event ID; corrections update that ID after
review. Source-table row occurrences identify separate same-day investments;
retain their order when correcting import inputs. Do not treat a revised amount
or a second announcement as a new event. An undisclosed amount stays unknown.
Debt, grants, acquisition prices and cumulative disclosures never enter the
company equity subtotal. Round lower bounds remain explicitly labeled.

`financing_events` participates in `master_transaction_records` alongside the
settlement ledger and organizational support. Agency and recipient reports query
the same records, rather than maintaining independent cached totals. A round and
its contributions cannot be summed as separate fundraising; filter by event type.

Public reads:

- `/api/network/orgs/public/:slug/financing`: agency roster, agency subtotals,
  company financing events and audit coverage, read in one transactional batch.
- `/api/network/financing/recipients/:id`: recipient's shared financing events;
  accepts recipient key, registered organization ID or organization slug.

Production reads and imports use `https://lifetech.fyi/api/org` with its tenant
hostname. POST `/api/network/orgs/:organizationId/financing/import` accepts up to
25 recipients and 250 events per transaction. Operator and live organization
management permission are checked at preview and apply. Review `changes`, then
send the identical payload with `confirm=true` and its one-use `previewId`.
Receipts are actor-bound and expire after ten minutes. A failed database batch
rolls back recipient, event and audit changes together. Completed earlier batches
are durable; preview again to resume. Reimporting the same IDs is idempotent.
Missing events in an import are retained; omission is not a deletion request.

Public organization replication snapshot version 3 includes the three financing
tables in the same transactional snapshot as organizations and support records.
Replicas atomically replace that public state and cannot accept writes. ETags
avoid transferring unchanged snapshots. Default refresh is five minutes; API
cache lifetime and page polling are one minute. Failures retain the last good
snapshot, record the error, and expose freshness and financing count through
`/api/network/replication/status`. All replicas must apply migration 0066 before
consuming version 3. No identity, permissions or operation receipts replicate.

The current import includes a search pass across 578 recipients, candidate
sources for 427 and eight verified large equity rounds and one cumulative financing disclosure. All histories remain
incomplete. Search results are unverified leads, never automatic financial
facts. The audit queue prioritizes unknown agency totals and tracks quarterly
review due dates; it does not claim a scheduled verification has happened.

Research leads persist in each agency-recipient audit record in the same database.
When a verified event cites that lead URL for the same recipient, the public
projection marks the lead verified and returns its transaction IDs. Pending
leads never become monetary amounts automatically. New rounds are additions
through the same reviewed, idempotent import; subsequent agency and recipient
views and snapshots regenerate from the committed records.

Financing events carry their own `tags` array, persisted as `tags_json` and
exposed in the master transaction view and public agency/recipient projections.
Use `portfolio:<portfolio name>` for evidenced portfolio funding. The TEDCO
import tags contributions documented by a TEDCO portfolio table as
`portfolio:TEDCO`; it does not infer that a separate whole-company round or
grant belongs to that portfolio. Explicit portfolio tags can name other funds.
Tags travel in the same atomic import and replication snapshot as each event.
