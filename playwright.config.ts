import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 180_000,
  expect: { timeout: 15_000 }, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4175', actionTimeout: 15_000, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { ...(existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort', url: 'http://127.0.0.1:4175/api/health', reuseExistingServer: false, timeout: 60_000, env: { NOU_DATABASE: 'sqlite', NOU_DEMO: '1', NOU_DATA_DIR: join(tmpdir(), `noudilo-e2e-demo-${Date.now()}`) } },
})
