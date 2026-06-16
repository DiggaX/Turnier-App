import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Make NEXT_PUBLIC_* (Supabase URL + anon key) from .env.local available to the
// Playwright runner process so specs can query the live backend directly.
loadEnvConfig(process.cwd(), false);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // Serialize: each registration spec performs an anonymous Supabase sign-in
  // against the shared live backend, which is rate-limited per IP. Running one
  // worker avoids bursty concurrent sign-ins tripping that limit.
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
