# Remaining network visualization work

Completion records and commit references: [PLAN_HISTORY.md](PLAN_HISTORY.md).
Implementation and benchmark details: [docs/network-exploration.md](docs/network-exploration.md).

## Performance acceptance
- [ ] Profile sustained live physics on a hardware GPU, including six-dimensional projection and All mode. Confirm the 10 FPS default budget, investigate long frame-time tails, and measure peak retained memory. The completed headless samples pause motion and cannot establish sustained live-physics performance.

## Data limits
- Geographic layout uses supplied coordinates and state metadata only. Real geographic coverage is limited by missing coordinates; county/municipality centroid aggregation is covered by synthetic tests. Legislative-district boundaries were not supplied and remain unavailable.

Release procedure and verification: [docs/deployment/RELEASE.md](docs/deployment/RELEASE.md).
