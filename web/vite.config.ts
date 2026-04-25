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
    'portal.arkavo.org',
    'dev.portal.arkavo.org',
    ...envAllowedHosts,
  ]),
)

const hmrHost = process.env.VITE_HMR_HOST || 'dev.portal.arkavo.org'

export default defineConfig(() => ({
  plugins: [react()],
  base: process.env.VITE_PUBLIC_BASE || '/',
  optimizeDeps: {
    exclude: ['pg']
  },
  server: {
    allowedHosts,
    host: true,
    hmr: {
      host: hmrHost,
      protocol: 'wss',
      clientPort: 443,
    },
    proxy: {
      '/pidp': { target: 'http://localhost:8000', changeOrigin: true },
      '/api/governance': { target: 'http://localhost:8002', changeOrigin: true },
    },
  },
}))
