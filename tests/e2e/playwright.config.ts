import { defineConfig, devices } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: path.join(__dirname),
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list']
  ],
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'mac',
      use: {
        ...devices['Desktop Chrome'],
        // For Electron testing, we use Playwright's Electron integration
        // The app is launched via electronApplication in the spec files
      }
    },
    {
      name: 'windows',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ],
  // Global setup / teardown for test DB seeding
  globalSetup: undefined,
  globalTeardown: undefined
})
