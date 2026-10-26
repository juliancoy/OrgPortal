# OrgPortal for Ubuntu

OrgPortal is the only maintained desktop app. Its initial view is
`https://lifetech.fyi/`, with the same LifeTech content, layout, theme preferences,
community features and account namespace. Only the native app name, icon,
launcher and package identity change. The website stays LifeTech.

## Replace an existing LifeTech installation

Download the package for your architecture from
[OrgPortal desktop releases](https://github.com/juliancoy/OrgPortal/releases/tag/desktop-v3.0.0).
Close LifeTech, then install the downloaded package, for example:

```sh
sudo apt install ./orgportal_3.0.0_amd64.deb
```

Review apt's proposed changes. The package declares a conflict with `lifetech`,
so apt asks before removing the old package and installing OrgPortal. Cancel to
keep LifeTech. There is no automatic uninstall, privileged app command, or silent
replacement. Open **OrgPortal** from Applications, or run `orgportal`.

LifeTech's saved profile is left in `~/.config/lifetech-desktop`; OrgPortal uses
`~/.config/orgportal-desktop` (under `$XDG_CONFIG_HOME` when configured).
Sign in again if needed. Removing the old package does not delete the profile.
The old app shows an optional replacement notice when it next loads the updated
LifeTech website. Dismissing the notice keeps the old installation usable.

## Development and packaging

From this directory:

```sh
npm ci
npm run dev
npm run build
```

The build writes `dist/orgportal_3.0.0_<architecture>.deb`, with its Electron
runtime included and the root-owned sandbox helper enabled. No host install is
performed by the build. Requires Python 3, dpkg tools, and Node/npm.

Development uses the sibling `BmoreMedTech` site's Vite configuration to keep the
LifeTech view identical. Install that site's dependencies too. It connects to
the existing local LifeTech preview at `https://localhost:8770`, using the
local identity service at `https://id.localhost:8443`. Development sessions use
`~/.config/orgportal-desktop-dev`; they are separate from production sessions.
Use `ORGPORTAL_LOCAL_ORIGIN`, `ORGPORTAL_IDENTITY_ORIGIN`, `ORGPORTAL_DEV_CERT`,
and `ORGPORTAL_IDENTITY_CERT` for custom local endpoints/certificate pins.
`ORGPORTAL_DEV_PORT` chooses the Vite port. Native menus, theme integration,
F10 application menu, browser sign-in, and live reload remain available.

## Verification

```sh
npm test
xvfb-run -a npm run test:native
xvfb-run -a npm run test:watch
npm run test:login
```

Login checks use only isolated local accounts and local services. Browser
sign-in retains the existing PIdP PKCE, loopback callback, random state, issuer
validation, cancellation and ten-minute expiry. This app does not migrate or
change PIdP, portal memberships or production databases.

`npm run build` followed by `npm test` also verifies the package metadata,
launcher arguments, packaged file paths and sandbox permissions when the built
artifact is available. To uninstall OrgPortal, use `sudo apt remove orgportal`;
its saved profile remains until you explicitly delete it.
