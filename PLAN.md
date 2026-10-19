# Remaining network visualization work

Completion records and commit references: [PLAN_HISTORY.md](PLAN_HISTORY.md).
Implementation and benchmark details: [docs/network-exploration.md](docs/network-exploration.md).

## Performance acceptance
- [ ] Profile sustained live physics on a hardware GPU, including six-dimensional projection and All mode. Confirm the 10 FPS default budget, investigate long frame-time tails, and measure peak retained memory. The completed headless samples pause motion and cannot establish sustained live-physics performance.

## Release reconciliation and deployment
- [ ] Reconcile the pre-existing, unstaged N-dimensional UI/projection changes with the release candidate. They remain preserved in the working checkout; the isolated committed overhaul builds against the previously committed projection implementation. Preserve unrelated login, home-page and other edits. Use a detached clean release checkout if needed; do not create a branch.
- [ ] Run the authorized OrgPortal frontend release from the clean candidate, then verify frontend commit identity, API proxy health, public navigation, and a read-only deployed visualization smoke test.

## Blockers and data limits
- Manual deployment credentials (`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`) are absent in this environment. No push or production deployment has been performed. An authenticated native-build alternative was not configured or verified during this task.
- The local checkout retains independent existing edits. Do not bypass the release cleanliness check or commit unrelated work to satisfy it.
- Geographic layout uses supplied coordinates and state metadata only. Real geographic coverage is limited by missing coordinates; county/municipality centroid aggregation is covered by synthetic tests. Legislative-district boundaries were not supplied and remain unavailable.
