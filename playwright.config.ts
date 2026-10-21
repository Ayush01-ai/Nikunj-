import { defineConfig } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login/whatsapp`,
    reuseExistingServer: false,
    timeout: 180_000,
    // Blank WhatsApp creds so the server uses its dev fallback and never calls Meta.
    env: {
      WHATSAPP_TOKEN: '',
      WHATSAPP_ACCESS_TOKEN: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
    },
  },
});
