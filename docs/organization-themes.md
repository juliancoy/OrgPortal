# Organization themes

Organization managers configure named themes with the existing
`preview_portal_branding` and `apply_portal_branding` MCP tools. Read the current
configuration with `get_portal_branding`. Each portal stores its configuration in
`feature_config.brandThemes`; changes take effect when the portal reloads.

Example preview arguments:

```json
{
  "organizationId": "YOUR_ORGANIZATION_ID",
  "brandThemes": {
    "defaultTheme": "ocean",
    "themes": [{
      "id": "ocean",
      "name": "Ocean",
      "light": {
        "surface": "#F0FAFF",
        "panel": "#FFFFFF",
        "text-primary": "#102030",
        "primary": "#005588",
        "btn-primary-bg": "#005588",
        "btn-primary-text": "#FFFFFF"
      },
      "dark": {
        "surface": "#102030",
        "panel": "#183040",
        "text-primary": "#F0FAFF",
        "primary": "#88CCFF",
        "btn-primary-bg": "#88CCFF",
        "btn-primary-text": "#102030"
      }
    }]
  }
}
```

Apply by passing the exact preview arguments plus the returned `previewId` to
`apply_portal_branding`. Existing portal write scopes, management authorization,
preview expiration, one-use receipts, and stale-state checks apply. Set
`brandThemes` to `null` through preview/apply to remove custom themes.

A configuration contains 1–24 themes with unique lowercase slug IDs and an
existing `defaultTheme`. Each theme has a display name and matching light/dark
maps containing 1–128 colors. Map keys are CSS custom-property names without
`--`; values must be six-digit hex colors. Tokens not supplied retain the
portal's built-in colors. Use the tokens in `web/src/styles/theme-foundation.css`
and `web/src/styles/themes/` for complete maps, including surfaces, text,
borders, buttons, focus, and status colors. Validate contrast for both modes.

Settings → System Appearance exposes the organization's named themes. The
selection stays in this browser and is scoped to the organization; it does not
change the account's light/dark/system setting. System mode follows the browser
color-scheme preference. Removed selections fall back to the organization
default. Switching to another portal replaces the color map; a portal without
custom themes clears it.
