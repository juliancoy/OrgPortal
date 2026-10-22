# Remaining network visualization work

[TODO.md](TODO.md) is the single actionable checklist. Completion records are in
[PLAN_HISTORY.md](PLAN_HISTORY.md); implementation and existing measurement details
are in [docs/network-exploration.md](docs/network-exploration.md).

## Current state

The reviewed network overhaul and acceptance fixes were deployed as `97478b7`.
That release's frontend and API commit identities were verified. This is a release
record, not a claim about the current production revision.

Local functional checks cover progressive disclosure, retained evidence records,
selection, graph switching, independent settings, N-dimensional controls, navigation
practice, fullscreen, and mobile layout. Live-worker 3D smoothing was also checked.
These checks do not establish sustained performance on a hardware GPU. Existing
short software-rendered samples show substantial stalls in All mode; the 10 FPS
minimum remains a target, not a demonstrated sustained result.

Geographic layout and county/municipality aggregation already exist, but use only
supplied coordinates and group metadata. Derived group centroids represent located
members, not administrative boundaries or inferred organization locations. Real
coverage is limited by missing coordinates; aggregation regression tests use
synthetic data. Legislative-district boundaries and district analysis are absent.

## Execution order

1. Extend the benchmark and select/document the hardware test device. Run the
   sustained scenario matrix and investigate failures against the proposed targets
   in TODO.md. Keep functional acceptance separate from performance evidence.
2. Audit authoritative coordinate coverage, then improve verified locations and
   validate existing county/municipality aggregation against real examples.
3. Acquire and verify district boundaries before implementing district grouping
   and display. Treat data acquisition and visualization as separate milestones.

Record measurements, sources, and completed work in PLAN_HISTORY.md; remove
completed checklist items from TODO.md. Do not mark missing data or unmeasured
performance as complete. Any future release follows
[docs/deployment/RELEASE.md](docs/deployment/RELEASE.md).
