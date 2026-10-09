# OrgPortal retention and deletion policy

Effective October 7, 2026. Owner: Julian Coy. Support, privacy and deletion
requests: **julian@codecollective.us**. Review this policy at least annually and
whenever a new data category, processor or integration is introduced.

OrgPortal is currently free and open-source software with no in-app purchases.
This policy applies to the operated OrgPortal service and its ChatGPT/MCP
integration. Independent self-hosted operators are responsible for their own
practices. The software license is not a privacy policy for their deployments.

## What we use and share

OrgPortal uses account identifiers, profiles, memberships, roles, event records,
messages, uploaded media and other community content to provide requested
features and enforce permissions. PIdP manages sign-in, credentials, sessions,
provider connections and OAuth grants. Cloudflare hosts the deployed services.
Authorized organization administrators and recipients can access information
according to its visibility and their permissions; public content is public.
Profile availability is visible to its owner and, when sharing is enabled, to
signed-in people who also share a saved upcoming schedule through a public
profile. Visitors who have not shared a schedule receive no availability slots.

When you use OrgPortal through ChatGPT or another MCP client, that client sends
tool arguments and receives authorized tool results. Those results may contain
organization or personal information. Review requested permissions and avoid
requesting information you do not want included in your conversation. The client
and any connected provider manage their own copies under their own policies.
Removing an OrgPortal record does not delete an existing ChatGPT conversation,
a recipient's copy, an exported file or a third-party calendar event.

## Retention schedule

These are adopted operational limits and review deadlines, not a claim that
every store already has automatic expiry. Temporary authorization state and
completed/unused preview receipts have scheduled cleanup; account erasure and
shared-content review remain operator-managed. Current controls and implementation
gaps are tracked in [operations](OPERATIONS.md). The owner must perform manual
reviews where automation is missing and record exceptions rather than silently
retaining data indefinitely. Shorter configured retention takes precedence.

| Data | Retention rule | Purpose |
| --- | --- | --- |
| Active account and private service data | While needed to provide the account; review accounts after 24 months of inactivity, notify before closure, and allow 30 days to respond | Service continuity without indefinite unattended retention |
| Account data approved for deletion | Target removal from live systems within 30 days of a verified request; explain any delay or exception before that deadline | Timely removal and accountable handling |
| Public organization, event and governance records | Review annually and on deletion requests; remove unnecessary personal identifiers, retain shared records only for a documented continuing organizational purpose | Preserve shared history without blanket permanent personal-data retention |
| Event company votes | Expire 90 days after the ballot closes; exclude expired votes from totals immediately and remove personal records within 24 hours of expiry through bounded cleanup; voters can clear each vote at any time | Per-company up/down preferences or a bounded favorites ballot per account; expose totals without individual votes |
| Routine application and request logs | Maximum 30 days | Diagnose faults and availability |
| Security incident evidence | Maximum 90 days unless an active documented investigation requires longer; review extensions every 30 days | Investigate abuse and protect accounts |
| Expired or consumed temporary OAuth state and previews | Remove within 24 hours after expiry/consumption; protocol validity remains much shorter and unchanged | Finish authorization and prevent replay |
| Credentials, sessions and delegated grants | Revoke promptly when access is withdrawn or account deletion begins; coordinate physical deletion with PIdP and providers | End access, separately from erasing stored records |
| Support correspondence | Delete or anonymize within 12 months after closure | Resolve follow-up questions |
| Minimal deletion audit | 12 months after completion, restricted access, request ID/dates/actions/exceptions only | Demonstrate completion without retaining deleted content |
| Backups and recovery copies | Target a maximum 30-day rolling window; verify each provider's actual window, document any mismatch and corrective action | Recovery with bounded residual copies |
| Development fixtures and exports containing personal data | Prefer synthetic data; approved temporary exports deleted within 7 days after their task finishes | Avoid uncontrolled extra copies |

Do not retain raw access/refresh tokens, passwords, authorization headers, full
tool arguments/results or message contents in diagnostic logs. Non-identifying
aggregate metrics may be kept longer only if re-identification is not possible.

## Requesting deletion

Email julian@codecollective.us with the account and scope you want removed.
Do not send passwords, tokens or identity documents. We verify control using an
existing authenticated account or another proportionate secure method before
making destructive changes. A request concerning one organization is not an
instruction to delete a shared identity across every tenant.

We aim to acknowledge requests within 7 days and complete verified requests
within 30 days. These are service targets, not a substitute for any applicable
shorter deadline. We explain what was removed, what remains, why it remains and
when it will be reviewed. Shared records may be anonymized rather than deleted
where needed to preserve other members' records. A legal or active security
hold must be specific, restricted, documented and periodically reviewed.

Disconnecting ChatGPT stops that connection; it does not automatically erase
your OrgPortal account. Deleting an account requires coordinated work across
OrgPortal, PIdP, media, messaging, queues, replicas and relevant providers.
Recovery copies may persist until their verified rotation date. They must not
be used for normal service and deletions must be reapplied before restored data
is made available. We cannot erase copies controlled by independent recipients.

## Basis and limits

The chosen periods are OrgPortal operational decisions, not universal legal
requirements or a claim of worldwide compliance. The design follows purpose
limitation, data minimization, periodic review and accountable erasure described
in the [ICO storage limitation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/).
Changes to actual behavior, published notices and these documents must stay in sync.
