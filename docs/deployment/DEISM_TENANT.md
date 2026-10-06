# Deism tenant

Deism uses the shared OrgPortal application and services. Its public website and
canon stay at `https://deism.church/`; doctrine and DeismU appear as external
resources in the portal. Existing Deism icons are copied into `web/public/images/deism`.

Migration `0069_deism_tenant.sql` links the `deism` tenant to the organization with
slug `deism`, reusing an existing organization if present. It publishes
`https://codecollective.us/p/portals/deism` with Deism branding, a community landing
page, sign-in, events, calendar, directory, and chat. Signed-in members go to chat.
The migration grants no memberships or administrator permissions. It preserves
existing organization data and existing tenant settings on reruns.

The migration records `portal.deism.church` as a requested domain, keeping the
shared slug URL canonical until provisioning is complete. CodeCollective's shared
host routing, chat origins, and PIdP origin defaults include the requested host.
These settings do not create DNS, attach a domain, or register OAuth callbacks.

Release through CodeCollective after applying the migration to the authoritative
org database. Establish an active owner/admin through the existing organization
membership workflow; never infer ownership from an email address. Provision
`portal.deism.church` on the shared site, configure PIdP trusted origins and exact
callbacks, and configure MCP resource metadata if MCP access is needed. Then use
the existing Portal panel or `attach_portal_custom_domain` workflow to attach the
provisioned domain. Do not deploy shared services from the Deism repository.

Verify the shared slug landing page, then the dedicated domain's home, login,
auth callback, organization profile, events, people, chat, install manifest,
icons, and service worker. Keep authenticated browser checks on the isolated
local Docker deployment, following `AGENTS.md`. Production checks are read-only
and unauthenticated. See `ORGPORTAL_TENANT_DEPLOYMENT.md` for the domain lifecycle.

## Local Docker suite

`python ../Deism/scripts/run-local.py` adds the generated Deism website on
`http://localhost:8878` and an isolated branded portal on
`https://localhost:8444` to the existing `bmoremedtech` network. Containers and
persistent database volumes use the `deism-` prefix. The launcher selects a
separate `ORGPORTAL_LOCAL_STATE_DIR`, so its gateway configuration and TLS files
do not replace another running portal's files. OrgPortal's shared TypeScript
source is mounted read-only into the worker and frontend containers.

Replication is disabled only for this writable fixture stack. The launcher
sets local resource links and seeds a sample community event. Run
`node web/scripts/test-local-deism.mjs` for headless click-through checks;
screenshots and results are under `web/.local/deism-clickthrough/`.
