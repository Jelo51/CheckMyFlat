import { defineConfig, devices } from '@playwright/test'

/**
 * Tests de bout en bout : l'application construite, Supabase local
 * (`supabase start`, seed appliqué) et stripe-mock. Voir README et
 * .github/workflows/ci.yml.
 */
const port = Number(process.env.E2E_PORT ?? 3000)

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /agent\.spec/ },
    // L'agent remplit le formulaire sur téléphone.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /agent\.spec/ },
  ],
  webServer: {
    command: 'node .output/server/index.mjs',
    port,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(port) },
    timeout: 60_000,
  },
})
