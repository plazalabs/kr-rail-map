// Playwright 설정. 기본은 로컬 정적 서버(4173 포트)에서 검사한다.
// 배포본을 검사하려면: BASE_URL=https://plazalabs.github.io/kr-rail-map/ npx playwright test
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,              // 불변식은 재시도로 통과시키지 않는다
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npx --yes http-server . -p 4173 -c-1 --silent',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
