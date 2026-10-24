# People directory

People shows all known portal people to visitors and signed-in users, regardless
of whether their contact profile is published. Basic names and photos remain
visible. Unpublished contact details, headlines, profile links and private email
addresses are excluded from directory responses. Direct access to unpublished
contact profiles is restricted to the owner, including for event attendees.
Search runs across the complete directory, with stable name/account ordering and
40 results per page. Previous and Next replace the old unpaginated 40-result cap.
Signed-in public-directory responses do not include email addresses.

Portal administrators can enable Show admin details after the server confirms
their administrator permission. This changes the private details shown, not
which people are eligible to appear. The private endpoint
`GET /api/admin/people?q=&limit=40&offset=0` independently checks live permission
and returns `users` and `nextOffset`, with `Cache-Control: no-store`.
It combines contact profiles (including unpublished ones), memberships,
individual ledger accounts and verified portal activity by canonical user ID.
These are known portal accounts, not every identity registered with PIdP.
No identity is inferred from matching email addresses. Unpublished profiles
remain unpublished, and have no public profile link.

Migration 0115 adds one private latest-activity record per canonical account.
A successful PIdP verification on a portal API request records name, email and
latest activity, with updates limited to once per five minutes. This is portal
activity, not proof of a fresh login or a session history. Recording failures
must not block authentication. Historical login timestamps cannot be backfilled;
missing activity is displayed as Not recorded. No session/token/IP data is stored.

Records expire after 90 days through the existing bounded retention job. Account
erasure must delete `portal_account_activity WHERE user_id = ?` alongside related
portal records. Excluded from immutable history and public replicas. Backup
restoration must reapply expiry and confirmed account deletions; exported admin
data and prior backups require separate deletion handling under the privacy
operations runbook. Existing profile, membership and ledger retention is unchanged.

Implementation is local. Migration has not been applied, and tests, builds and
deployment have not been run at the user's request. Live collection is not active
until the migration and release are reviewed and applied.
