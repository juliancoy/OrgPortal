# Alternate domains

The canonical registry is `../PIdP/shared/portal-clients.json` (paths relative to
this repository). It defines exact origins, callback policy, account namespace,
and whether each domain uses OrgPortal routing and PIdP website login.

Run `node ../PIdP/scripts/sync-portal-domains.mjs --write` to regenerate this
repository's `ORGPORTAL_SITE_HOSTS` and PIdP's allowlist. Use `--check` before
release; do not edit the generated hostname string by hand. See
`../PIdP/docs/portal-domains.md` for the domain setup procedure.

The registry adds routing configuration only. Tenant ownership and verified
custom-domain attachment remain in OrgPortal, with live permission checks.
Each service still releases independently. Never deploy a dirty checkout to
register a domain; configuration-only updates must preserve deployed code and
all unrelated bindings.
