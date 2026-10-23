# Website observatory

Open `/admin?tab=stats` → Website request observatory on OrgPortal. System-admin
permission comes exclusively from PIdP `is_sysadmin`; report access is not granted
by membership in an organization, a matching email or a collector credential.

The UI, authenticated API, report storage, grouping and history are hosted by
OrgPortal. A separate fresh-browser probe performs hourly read-only homepage captures
from its network vantage. The existing probe polls for portal capture requests once
a minute, uploads new reports and retains its own 30-day local history. A queued
capture therefore may take two minutes to appear; a disconnected probe leaves it
queued rather than fabricating a result. No browser connects from the portal to
`map.local` or receives the collector secret.

API: `/api/org/api/admin/website-observatory` (system-admin report reads), `/capture`
(POST, system-admin capture queue), `/:id` (DELETE, system-admin removal), `/collector`
(GET/POST, dedicated scoped probe token). Request bodies are bounded to 512 KiB,
validated and projected onto a field allowlist. The server recomputes summaries,
rejects arbitrary sites and observations older than 30 days, and uses deterministic
report IDs for retry-safe uploads. The latest 200 retained reports are listed;
individual retained IDs remain readable. Admin requests are never publicly cached.

Storage uses the existing private `SCAN_IMAGES` R2 binding under
`private/website-observatory/`. The bucket must have both managed-public and custom
public domains disabled. Public media handlers require a linked database media row
and do not serve arbitrary keys. No D1 migration or new private journal table is
needed. `pruneWebsiteObservatory` runs through the existing minute cron; expired
objects are found with `startAfter` and removed in batches of 100. API reads enforce
expiry independently of deletion. See the retention/deletion policy for local copies,
backups and operational journal exclusions.

Configure the `WEBSITE_OBSERVATORY_TOKEN` Worker secret and the probe's mode-0600
`~/.config/lan-monitor/orgportal.json` with the same `token`. It must never be a PIdP
account token or be placed in frontend files, build vars, logs or URLs. Rotate the
Worker secret and host file together. The probe uploads only synthetic website
observations, never LAN-device inventory. The standalone probe lives in `tools/website-probe/`, runs with Playwright and
`/usr/bin/google-chrome`, and stores its local SQLite history and sync ledger under
`~/.local/share/orgportal/website-probe/`. Install its user service template after
adjusting interpreter/workspace paths for the host. It requires no raw sockets,
LAN discovery, Docker privileges or inbound port. Existing local reports can be
migrated with SQLite backup before starting the service.
Reports remain available if the probe is offline, with observation time and collection
vantage visible. Collector and Chromium versions distinguish monitoring changes
from application changes.

Browser requests, CDN network identity, server traces and real-user analytics remain
different evidence types. Provider grouping uses explicit domain families for browser
origins; sharing a Cloudflare address does not imply shared website ownership. The
initial release has synthetic browser observations only; server traces and real-user
measurements require separate authorized adapters, not a renamed browser metric.
