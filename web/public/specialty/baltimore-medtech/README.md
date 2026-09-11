# Baltimore MedTech specialty pages

This folder contains MedTech-specific static pages that are exposed through OrgPortal without becoming generic portal code.

Public routes:

- `/specialty/baltimore-medtech/map.html`
- `/specialty/baltimore-medtech/datasets.html`
- `/specialty/baltimore-medtech/taxonomy.html`
- `/specialty/baltimore-medtech/need-availability-distortions.html`

OrgPortal links to these routes from tenant `feature_config.specialtyResources`. The Cloudflare Worker keeps legacy root paths such as `/map.html` and `/datasets.html` redirecting here on tenant domains.

Keep MedTech-specific HTML, CSS, JavaScript, and JSON here. Keep reusable tenant UX in `portal/web/src`. If a specialty page needs an API, mount it under `/specialty/baltimore-medtech/api/...` from `cloudflare/medtech` so it does not pollute the generic OrgPortal API.
