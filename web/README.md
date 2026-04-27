# React + TypeScript + Vite

## App Update Channel (Web + Android)

OrgPortal checks for update metadata from `mobile-update.json` and prompts users when a newer build exists.

- Web: compares current build constant (`__APP_BUILD_NUMBER__`) to `web.buildNumber`, then offers reload.
- Native Android (Capacitor): compares `App.getInfo().build` to `android.buildNumber`, then opens `android.apkUrl`.
- Optional updates can be dismissed per target/build in local storage; mandatory updates (below `minSupportedBuildNumber`) cannot.

Manifest locations used by deployment:

- `OrgPortal/web/public/mobile-update.json` (web host copy)
- `static/mobile-update.json` (static host copy for native)

Release flow:

1. Build and publish APK to static host (default URL is `https://static.arkavo.org/orgportal-android-release.apk`).
2. Update `android.versionName`, `android.buildNumber`, and `android.minSupportedBuildNumber` as needed.
3. Update `web.versionName` and `web.buildNumber` for web deploys.
4. Publish both manifest files with the release.

Environment overrides:

- `VITE_UPDATE_MANIFEST_URL`: explicit manifest URL.
- `VITE_APP_BUILD_NUMBER`: compile-time web build number.

## Cloudflare Deploy

This app can be deployed with Wrangler using:

```bash
npm run deploy:cf
```

`wrangler.toml` serves static assets from `dist/` and uses a Worker to proxy:

- `/api/governance/*` -> `GOVERNANCE_API_ORIGIN`
- `/pidp/*` -> `PIDP_API_ORIGIN`

For the full end-to-end setup with hosted PIdP (`https://pidp.arkavo.org`), see:

- `../docs/deployment/CLOUDFLARE_PIDP_DEPLOYMENT.md`

## Matrix Chat Configuration

OrgPortal chat now uses Matrix as the backend (`/chat` and `/chat/:roomId` routes).

Configure the Matrix homeserver URL:

```bash
VITE_MATRIX_BASE_URL=https://matrix.arkavo.org
```

Fallback behavior:
- If `VITE_MATRIX_BASE_URL` is unset, the app falls back to `VITE_SYNAPSE_BASE_URL`.
- If both are unset, it defaults to `https://matrix.arkavo.org`.

Optional local chat backend override:

```bash
VITE_CHAT_BACKEND=mock
```

Supported values:
- `matrix` (default)
- `mock`

### Seamless Matrix Session Bootstrap via Org Backend

OrgPortal chat will attempt automatic Matrix session bootstrap first by calling:

- `POST /api/org/api/network/chat/bootstrap`

This requires the org backend to be configured with:

- `ORG_MATRIX_HOMESERVER_URL`
- `ORG_MATRIX_SERVER_NAME`
- `ORG_MATRIX_ADMIN_TOKEN`
- `ORG_MATRIX_PASSWORD_SECRET`

If unavailable, the UI falls back to manual Matrix SSO connect flow.

## Testing

Run unit and adapter integration tests:

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

Live Matrix smoke test against a running homeserver:

```bash
MATRIX_BASE_URL=http://synapse:8008 \
MATRIX_SMOKE_USER=orgportal_smoke \
MATRIX_SMOKE_PASSWORD=orgportal_smoke_pw \
npm run test:matrix:live
```

If running from a Docker Node container, join the `arkavo` network:

```bash
docker run --rm --network arkavo \
  -e MATRIX_BASE_URL=http://synapse:8008 \
  -e MATRIX_SMOKE_USER=orgportal_smoke \
  -e MATRIX_SMOKE_PASSWORD=orgportal_smoke_pw \
  -v "$PWD:/workspace" -w /workspace node:20-bookworm \
  bash -lc 'npm install && npm run test:matrix:live'
```

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
