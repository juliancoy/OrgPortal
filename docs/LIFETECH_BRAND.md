# LifeTech brand and accessible color use

The shared source is `shared/lifetechBrand.json`. The first three colors remain
LifeTech's core identity: HealthTech Teal `#155E59`, MedTech OffWhite `#F4F5F0`
(the MRI-inspired off-white), and BioTech Gold `#D4AF37` (biotechnology's monetary
potential). The other fifteen colors support text, surfaces, controls and dark mode.

Generate the portal and public website themes together:

```sh
node scripts/build-lifetech-brand.mjs
node scripts/build-lifetech-brand.mjs --check
```

This writes `web/src/styles/themes/lifetech.css` and the sibling
`BmoreMedTech/assets/lifetech-brand.css`. The public site's build includes its
stylesheet only for LifeTech; MedTech keeps its own presentation. Do not edit
these generated styles independently. Explicit organization palette overrides
remain authoritative; review their pairings before applying them.

The organization branding tab shows all eighteen colors, their intended uses and
measured approved pairings. The PNG guide includes the same usage notes and
ratios. Original artwork and its transparency are preserved.

## Contrast rules

Target [WCAG 2.2 AA text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html):
4.5:1 for ordinary text and 3:1 for large text. Essential control indicators and
meaningful graphical boundaries target
[3:1 non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
Compare unrounded ratios against these thresholds.

- Light themes use Deep Ink or Muted Ink text on white, OffWhite or Teal Mist.
- Dark themes use OffWhite or Muted Light text on Deep Ink or Deep Teal Surface.
- Light-theme buttons use OffWhite text on HealthTech Teal. Dark-theme buttons
  use Deep Ink text on Light Teal. Selected, hovered and focused states need
  the same review as the default state.
- BioTech Gold is an accent and works as text on dark surfaces. It does not
  meet ordinary-text contrast on OffWhite. Use Gold Ink for gold-family text
  on light surfaces; use Deep Ink text on filled gold badges and buttons.
- Use Control Teal for light-theme input boundaries. Keyboard focus uses
  HealthTech Teal in light mode and Light Teal in dark mode.
- Keep labels, icons or shapes alongside semantic colors in diagrams,
  categories, statuses and validation. Use readable foreground text even when
  the category marker uses another hue. Avoid opacity that weakens contrast.
- Text over photos or gradients needs visual review in addition to automated
  checks. Preserve the existing reduced-motion treatment of animated accents.

## Verification

Palette pairings have regression coverage in
`org-worker/test/lifetech-brand-contrast.test.ts`. The API branding tests cover
stored overrides and the unchanged management, preview and apply requirements.

With the local LifeTech preview running, run:

```sh
cd web
node scripts/audit-lifetech-contrast.mjs https://localhost:8770 ../artifacts/lifetech-contrast/local --all
```

The audit captures both themes, checks actual rendered text and text links with
axe, and reports incomplete checks for visual review. It suppresses automatic
writes and accepts only the LifeTech domain or loopback previews. Additional
page paths can be supplied after the output directory. Private layouts use the
existing synthetic layout-review fixtures, not real member data.

These checks address contrast and brand consistency. They do not alone certify
full WCAG or ADA compliance. [DOJ web accessibility guidance](https://www.ada.gov/resources/web-guidance/)
also discusses keyboard access, accessible forms, alternatives and other barriers.
