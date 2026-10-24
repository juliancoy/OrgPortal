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
the service desk, a tenant brand guide, and the About page.

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
