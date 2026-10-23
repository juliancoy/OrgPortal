# Five over Five

Code Collective links to `/orgs/code-collective/five-over-five`. The same scoped
page/API is reusable by other organizations. The public org landing page remains
the destination after website login; explicit login return paths are preserved.
The site and OrgPortal deploy independently.

Authenticated people can nominate a person with a concrete accomplishment,
community connection, optional HTTPS work link, and eligibility/permission
attestations. The eligibility threshold is literally older than five years.
No real nominees or biographical claims are invented or seeded. The five places
on the live leaderboard fill as nominations receive votes; they are not official
award selections. Equal scores share ranks, displayed in nomination order.

Each canonical identity has one replaceable private ballot per organization.
The allowance is ceil(active nominees / 4): 0→0, 1–4→1, 5–8→2, 9–12→3.
The server atomically validates cap, current nominees and organization scope.
Nomination withdrawal removes associated votes and trims ballots as needed.
Each account may publish 10 nominations; each organization holds at most 500.
Live organization owners/administrators can remove nominations. Ballots and
nominations expire after one year; see the privacy runbook for erasure/restores.

Migration 0101 is additive, creates two stores/indexes and a deletion trigger,
and excludes both from the immutable journal. Review and apply separately before
releasing the Worker. Existing Workers ignore the new tables. Rollback retains
these tables for later compatible releases; do not drop live nominations/ballots.

Local checks: `node --import tsx --test test/organization-recognition.test.ts
test/retention.test.ts` in org-worker, affected portal feature/routing tests,
TypeScript, and `web/scripts/test-local-five-over-five.py` against isolated Docker.
