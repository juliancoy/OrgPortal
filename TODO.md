# Network visualization TODO

This is the checklist for remaining network work. Context and sequencing are in
[PLAN.md](PLAN.md). The criteria below are targets for future validation, not
results already achieved.

## Sustained performance

- [ ] Add a sustained benchmark that enables live physics and normal motion,
  verifies the active hardware GPU backend, and records frame times, interaction
  latency, worker activity, and memory. The existing browser benchmark forces
  SwiftShader, requests reduced motion, and samples only ten animation frames;
  it cannot establish hardware-GPU or sustained live-physics performance.
- [ ] Run that benchmark on a documented hardware-GPU device. Record device/CPU,
  GPU/driver, OS, browser version, renderer backend, viewport, commit, dataset
  fingerprint, node/record counts, and settings. Use a 1360×900 viewport, a
  30-second warmup, and three five-minute runs for each combination of 3D and
  six-dimensional rendering with Overview and All disclosure. Include repeated
  pan, zoom, selection, and disclosure changes during each run.
- [ ] Evaluate the proposed performance gate: median rendered-frame interval
  ≤100 ms (the default 10 FPS target), p95 ≤200 ms, p99 ≤500 ms, and no interaction
  stall over one second. Measure actual paints separately from animation-frame
  callbacks. Report every failing scenario; All mode is not exempt. Record peak
  page/worker memory and compare post-GC retained memory after warmup and at the
  end: growth should stay within the larger of 20 MiB or 10%, with no repeatable
  upward trend across runs. Document unavailable memory measurements as a gap.
  Investigate failures and rerun affected scenarios before marking this complete.

## Geographic coverage

- [ ] Audit coordinate coverage against the authoritative remote organization
  data. Report located, missing, invalid, and out-of-state counts with a retrieval
  timestamp. Add missing coordinates only from verified sources, retaining source
  URLs, retrieval dates, and coordinate meaning. Do not substitute county or city
  centroids for an organization's location; leave unresolved locations explicit.
- [ ] Validate county and municipality aggregation using verified real locations.
  Check group membership, counts, derived centroids of located members, expansion
  back to original coordinates, and exclusion/reporting of missing locations.
  Keep synthetic regression coverage; record the real-data sample and sources.
- [ ] Obtain and verify Maryland legislative-district boundary data. Record the
  official source, retrieval date, boundary vintage/effective dates, district
  chamber/type, identifiers, coordinate system, and license. Boundary acquisition
  alone does not complete district visualization.
- [ ] Implement and validate legislative-district grouping and display using the
  verified boundaries and published organization coordinates. Define treatment
  of boundary points and missing locations, show district vintage/source, and
  test known inside/outside/boundary cases. District analysis is currently absent.
