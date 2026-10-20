# Portal themes

`theme-foundation.css` owns brand-neutral defaults, typography tokens, spacing,
shadows, and semantic status/voting colors. Shared component styles in `index.css`
consume semantic variables; do not add a brand palette there.

`themes/` contains complete light and dark palettes for each portal profile.
OrgPortal also supplies the startup default before a profile is available.
CodeCollective blue is scoped exclusively to the `code-collective` profile.
Brand-specific component layout remains in `tenantBranding.css`.

The profile is selected by `config/portalFeatures.ts` and applied by
`config/portalBranding.ts`. The independently selected appearance is managed by
`config/theme.ts`: an explicit `data-theme` takes precedence; otherwise the CSS
system preference applies. Each brand's system-dark block must match its explicit
dark block. LifeTech's existing default-dark preference remains in theme.ts.

When adding a theme, supply all the palette variables used by the OrgPortal theme
for both appearances. Use neutral surfaces where appropriate; do not inherit a
palette from another brand. Preserve semantic meaning for errors and vote colors.
Use `--primary`, `--panel`, `--text-primary`, etc. in components instead of literal
brand colors. Explicit event artwork and data visualization colors are separate.

With the local app running, verify the CSS cascade and representative text/button
contrast (minimum 4.5:1):

```sh
node web/scripts/check-brand-themes.mjs
```

This checks all brands, explicit light/dark selection against the opposite system
preference, system light/dark parity, and the default OrgPortal palette.
It does not constitute a full-page accessibility audit.
