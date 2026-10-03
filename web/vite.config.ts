import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const envAllowedHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

const allowedHosts = Array.from(
  new Set([
    'localhost',
    '127.0.0.1',
    'codecollective.us',
    'www.codecollective.us',
    ...envAllowedHosts,
  ]),
)

const parsedBuildNumber = Number.parseInt(process.env.VITE_APP_BUILD_NUMBER || `${Math.floor(Date.now() / 1000)}`, 10)
const appBuildNumber = Number.isFinite(parsedBuildNumber) ? parsedBuildNumber : Math.floor(Date.now() / 1000)
const appVersion = process.env.npm_package_version || '0.0.0'
const pidpProxyOrigin = process.env.PIDP_PROXY_ORIGIN || process.env.PIDP_API_ORIGIN || 'http://localhost:8000'
const orgApiOrigin = process.env.ORG_API_ORIGIN || ''
const chatApiOrigin = process.env.CHAT_API_ORIGIN || ''
const governanceApiOrigin = process.env.GOVERNANCE_API_ORIGIN || 'http://localhost:8002'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: process.env.VITE_PUBLIC_BASE || (command === 'build' ? './' : '/'),
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_NUMBER__: appBuildNumber,
  },
  optimizeDeps: {
    exclude: ['pg']
  },
  server: {
    allowedHosts,
    host: true,
    // Let Vite use the page origin for HTTP and WebSocket connections.
    // This also works through the local HTTPS gateway on port 8443.
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === '1',
      interval: Number(process.env.CHOKIDAR_INTERVAL || 200),
      ignored: ['**/dist/**', '**/playwright-report/**', '**/test-results/**'],
    },
    proxy: {
      ...(chatApiOrigin ? { '/api/chat': { target: chatApiOrigin, changeOrigin: true, xfwd: true, ws: true, rewrite: (path: string) => path.replace(/^\/api\/chat/, '') } } : {}),
      '/pidp': {
        target: pidpProxyOrigin,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pidp/, ''),
      },
      ...(orgApiOrigin
        ? {
            '/api/org': {
              target: orgApiOrigin,
              changeOrigin: true,
              xfwd: true,
              rewrite: (path: string) => path.replace(/^\/api\/org/, ''),
            },
          }
        : {}),
      '/api/governance': { target: governanceApiOrigin, changeOrigin: true },
    },
  },
}))
