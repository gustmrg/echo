import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:5190', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/e2e-stack.mjs', url: 'http://127.0.0.1:5193', timeout: 60_000 },
    { command: 'pnpm dev --host 127.0.0.1 --port 5190 --strictPort', url: 'http://127.0.0.1:5190',
      env: { API_PROXY_TARGET: 'http://127.0.0.1:5191' } },
  ],
})
