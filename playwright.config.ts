import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 2577;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The installed Google Chrome, so Playwright needs no browser download.
    channel: "chrome",
    headless: true,
  },
  webServer: {
    command: `npm run build && PORT=${PORT} npm start`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    // Test matches log to a temporary folder, not the real logs/.
    // MATCH_SEED fixes the packs: with seed 1 the first pack is a mine at (450, 600), near Crew 1's start.
    env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "1" },
    timeout: 60_000,
  },
});
