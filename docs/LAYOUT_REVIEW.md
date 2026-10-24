# Layout review

Render isolated, synthetic examples of the real portal components:

```sh
cd web
npm run render:layouts
```

The command captures desktop (1440 × 1000) and mobile (390 × 844) images in
light and dark themes. Each capture has a fresh browser context. The fixture
server uses synthetic data, refuses writes, and needs no credentials or external
services. It renders workspace, organization and people directories, an empty
state, events with no cover image, onboarding, the completed JOIN NOW action,
the service inbox, conversation, compose, settings and empty states, a tenant
brand guide, and the About page.

Images, four labeled contact sheets, and reports are written under
`artifacts/layout-review/fixtures`. Open the contact sheets and inspect any
problem layout at full resolution. A passing capture is not visual approval.
The runner reports JavaScript errors, failed captures, and horizontal overflow.
These checks do not replace authentication or API tests.

For read-only captures of local application URLs, create an array of objects
with `name`, `url`, optional `ready` selector and optional crop `selector`:

```sh
node scripts/render-layouts.mjs path/to/layouts.json ../artifacts/layout-review/current
```

Only loopback URLs are accepted. A redirected authentication screen represents
sign-in, not the intended authenticated layout; use the isolated fixture instead.

## Distributed runs

The Organization workspace's `lan-monitor` runner assigns a separate **Portal
layout renders** suite. It uses the pinned Playwright image and the run's exact
OrgPortal commit, with Docker networking disabled during rendering. PNG and JSON
artifacts travel over the existing authenticated launcher event stream in bounded,
checksummed chunks. The distributed run details show contact-sheet previews and
links to individual screenshots and reports. Artifacts expire with their run.
An unchanged visual suite links back to its recorded passing baseline.

Integrating this suite does not start a run. The distributed start operation also
commits and pushes repositories; use it only when explicitly requested.

## Submission cards

The visual suite includes collapsed, expanded, and unselected submission cards in
both themes on desktop and mobile. The fixture uses synthetic organizations and
teams; the server refuses writes. It also checks actual controls at 320, 390,
and 1440 pixels: collapse hides details, expand and team disclosure preserve the
vote, edit and delete confirmation preserve the vote, cancellation preserves the
application, and mouse/keyboard voting each makes exactly one synthetic request.
Vote responses are intercepted in browser memory; these checks never submit a
production ballot or delete an application.

For a focused iteration with the same fixtures and interaction checks:

```sh
SUBMISSION_REVIEW_ONLY=1 node scripts/render-layout-fixtures.mjs ../artifacts/layout-review/submissions
```

Review the contact sheets and `submission-interactions.json`. Inspect the
expanded team and application controls, the unselected state, theme contrast and
mobile wrapping. A completed render alone does not prove these are satisfactory.
The normal distributed `visual` suite includes these checks without the filter.

## User task heuristics

The fixture interaction runner also writes `user-heuristics.json`, using the
[task-based user model](USER_HEURISTIC_MODEL.md). Entry-control checks are separate
from task completion and human hierarchy review; uncovered journeys remain
explicitly unassessed. The distributed visual suite uses the same runner.
