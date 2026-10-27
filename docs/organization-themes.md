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

Core tokens (`surface`, `panel`, `panel-2`, `text-primary`, `text-secondary`,
`primary`, `on-primary`, `border`) also populate the matching component tokens,
so buttons, navigation, inputs, focus indicators, and page surfaces share the
portal palette. An explicit component token overrides its derived value.
The organization brand guide offers theme and color-mode selectors, includes
the selected map beside the core brand swatches, and computes contrast from
those mapped colors. PNG exports use the same selection and mapped paper/ink.

Administrators can also select and save a named theme on the organization's
**Branding** tab. Postcapitalist Corporate and AnkhTech replace the retired Harbor Teal, Midnight Gold, and Botanical presets. Configured organization themes supply the complete chooser; built-in presets are used only when none are saved. Each
preset contains independent icon, avatar, and standard background imagery;
each image can be replaced with a compressed upload. The selected default and
per-theme `imagery: { icon, avatar, background }` are stored with `brandThemes`.
The icon supplies portal identity, the avatar supplies the organization profile,
and the background supplies the organization cover and first poster backdrop.
Organization colors stay within the organization page; the host portal keeps its
own identity. Saving requires live owner or administrator access.

New posters use a geometric gradient composition. Descriptions are off by
default in every format. Select **Description** in the poster's element controls
and enable **Show description** to include one. Explicitly requested event
agendas remain available; saved individual layouts are retained.

LifeTech shares HealthTech Teal (`#155E59`), MedTech OffWhite (`#F4F5F0`),
and BioTech Gold (`#D4AF37`) across both styles. The brand guide highlights these
three core colors separately from supporting accessibility shades and theme mappings.
Postcapitalist Corporate uses the three-bar identity; AnkhTech retains the medical
ankh. Each provides a square icon, profile avatar, and landscape background.
