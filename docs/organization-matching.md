# Auditable organization associations

An accepted association is an active, shared record in
`organization_source_identities` (`orgportal:evidence-group`). Original records,
identifiers, labels, amounts, and permissions are retained. Group projections
union evidence by record ID; they do not create additional payments.

The name policy `organization-name-v1` accepts sufficiently distinctive normalized
full names or one qualifying single-character typo. It records normalization,
similarity score, reasons and conflicts. Scores measure name similarity, not
probability. Hospital, foundation, campus, unit and legal-suffix differences
prevent automatic name-only association. Equally strong directory alternatives
require review. The UI's candidate eligibility is preliminary; the server
recomputes the decision using current names and identities.

`organization-identity-v1` also checks EINs from the group's reviewed source nodes
and the candidate's published identifiers. Different EINs prevent automatic
association, even for identical names. A candidate EIN with no established group
EIN requires review first. An identical single EIN can support differently named
source records. Multiple EINs require review. Related corporations, group-exempt
subordinates and disregarded entities do not become the same legal entity merely
because they share control or a brand.

Automatic mode is available through the existing preview/apply MCP operation and
PUT endpoint. The local editor can associate eligible candidates on the current
page. There is no unattended global matching scheduler. Every write rechecks live
management/operator permission. MCP applies require the exact one-use preview.
Exact federal IDs absent from an older export are validated against USAspending
master observations using both the identifier and original source label.

Each change records method, matcher version, score/reasons, known EINs, source
reference/checksum, reason, and prior members in the existing audit table. Public
history excludes editor account IDs. Existing older associations may lack matcher
provenance; the service does not invent it. Removals append an audit event and a
persistent `orgportal:evidence-group-excluded` marker. Later automatic runs and
matcher versions cannot restore that pair. An explicit authorized manual add can
restore it and clear the exclusion. The API preserves these changes without a
schema migration.

Active mappings replicate through the existing public snapshot. Audit history and
exclusion markers currently remain on the authoritative service; replicas cannot
accept group writes. A new directory anchor may be newer than the frontend's graph
snapshot, so a graph snapshot refresh is still required for its map to include it.

These are public organizational records subject to annual review and verified
correction/deletion under [the retention policy](privacy/RETENTION_AND_DELETION.md).
Private editor IDs remain in the existing audit lifecycle and are not copied to a
new personal-data store. Restore procedures must preserve exclusions with active
mappings, otherwise a previously removed association could be suggested again.
A human removal is not deletion of the underlying public source document.
