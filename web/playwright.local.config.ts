import { defineConfig } from '@playwright/test'
import config from './playwright.config'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://localhost:8443'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('Local browser tests require a localhost deployment.')
}

export default defineConfig({
  ...config,
  webServer: undefined,
  outputDir: './test-results/local',
  workers: 2,
  use: { ...config.use, baseURL, ignoreHTTPSErrors: true, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/google-chrome', args: ['--no-sandbox'] } },
})
