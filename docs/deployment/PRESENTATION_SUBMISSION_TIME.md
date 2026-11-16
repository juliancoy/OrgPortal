# Presentation submission timestamps — November 16, 2026

Every application card, details view and organizer review shows a date, time and
local timezone. Guest applications use their original created_at. Team entries
preserve submitted_at across edits, retries and review decisions. CSV exports
include submitted_at, submission_time_source and the separate updated_at. Host
emails include the receipt timestamp in UTC.

## Explicit migration review

Migration 0136 is additive and must precede the API release. It introduces two
columns and two triggers, without extending retention or creating another store.
Existing team applications use an original host-outbox receipt where available.
Otherwise support-record creation or the surviving updated_at provides a clearly
labeled First recorded time, not a claimed original submission time. New inserts
initialize the timestamp from the server-generated initial updated_at. An
immutability trigger rejects changes to either populated timestamp or its source.
The previous API and legacy insert mirror remain compatible; rollback does not
undo these fields. Application deletion and expiry continue removing the whole
row. Guest data remains private and uses its existing creation timestamp.

## Validation

Thirty focused application/host-email API tests passed, including original receipt
preservation across retry, edit and review; public/private projection; CSV export;
historical migration; and previous API insert compatibility. Three timestamp
component tests passed, as did API and frontend TypeScript checks. A local,
headless synthetic-fixture browser check passed at 390px and 1440px for cards,
details, organizer review and guest review, with timezone labels and no horizontal
overflow. Mobile screenshots were visually reviewed. No production applications
or emails were created. Commands and source fingerprints are recorded in
org-worker/test/submission-time.test-log.jsonl.

Previous API version: 0f308226-0782-4ee8-8238-fdb2dcc5b7cf.
Previous frontend version: 6ef39c6d-886e-4933-84c8-3c3aa23b5686.
Migration 0136 applied successfully as the only pending production migration.
The first build exported current public data but failed to hash stale root-owned
generated folders. The generated query directory was preserved outside the build
output before retrying; no source or production data was removed.
Release uses the existing pinned Docker workflow; no gradual rollout is claimed.
