# Organization profiles from the CLI

Sign in using the existing portal-bound connection. Tokens remain in the OS
keyring; no browser session token needs to be copied.

```sh
node org-worker/scripts/orgportal.mjs auth login --portal https://lifetech.fyi --browser
node org-worker/scripts/orgportal.mjs profile get --organization ORGANIZATION_ID
node org-worker/scripts/orgportal.mjs profile preview --organization ORGANIZATION_ID --file patch.json
node org-worker/scripts/orgportal.mjs profile apply --organization ORGANIZATION_ID --file patch.json --preview-id PREVIEW_UUID
node org-worker/scripts/orgportal.mjs profile status --organization ORGANIZATION_ID --preview-id PREVIEW_UUID
```

All commands accept `--portal` and `--connection` as with existing CLI commands.
Profile commands require a saved connection. `get` requires active membership;
`preview`, `apply`, and `status` require owner or administrator access to that
specific organization. Membership in a parent or supporter does not grant access
to descendants. OAuth consent alone does not grant management permission.

`patch.json` contains only the fields to change: `name`, `description`,
`image_url`, `city`, or `tags`. Omitted fields are preserved. A null description,
image URL or city clears it; an empty tags array clears tags. Image URLs must be
HTTPS without credentials. Identity, membership and ownership fields
cannot be smuggled through arbitrary JSON keys.

Review the returned before/after profile, then apply the same patch with its
preview ID within ten minutes. Receipts are one-use and bound to the account,
organization, complete profile state and requested changes. Concurrent edits
or removed management access prevent the save; request a new preview. After a
network error inspect the live profile and receipt status before retrying.

The four MCP tools are `get_organization_profile`,
`preview_organization_profile`, `apply_organization_profile`, and
`get_organization_profile_operation`. Read/status require `org:portal.read`;
preview/apply additionally require `org:portal.write`. Tools preserve the
connection's configured organization restriction.

Research for the five Amplify pitch companies is in
[the research manifest](research/amplify-pitch-startups-2026-10-08.json). Extract
one entry's `patch` object to a JSON file, then preview/apply it against that
entry's organization ID. The voting section reads the saved organization fields.
