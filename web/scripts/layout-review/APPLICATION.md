# Application layout review

From `web/`, run:

```sh
node scripts/render-application-layouts.mjs ../artifacts/application-review/current
```

This renders the real EventPresentations component and portal styles in a disposable,
read-only local server with synthetic identity, organization, roster, and draft data.
It does not use real sessions or submit applications. No deployed service is changed.

The four states are new team, existing organization, edit application, and guest.
Each is captured at desktop and phone widths in light and dark themes, with labeled
contact sheets, a JSON manifest, and render reports. Inspect the PNGs after each change.
The component fixture does not cover the surrounding event page or submission behavior.

The attachment helper has a case-sensitive filename collision with the attachments
component; the fixture resolver explicitly selects the lowercase `.ts` helper.
