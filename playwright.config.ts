import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 2577;
/** Second test server, for the EMP test (its own MATCH_SEED) and the closing-storm test (a sooner storm). */
export const EMP_PORT = 2578;
/** Third test server, for the moving-storm test (dynamic hazards from 0:02). */
export const HAZARD_PORT = 2579;

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
  webServer: [
    {
      command: `npm run build && PORT=${PORT} npm start`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      // Test matches log to a temporary folder, not the real logs/.
      // MATCH_SEED fixes the packs: with seed 367 the first pack is a mine at (450, 300) and the second
      // (at 0:22) a torpedo at (450, 600), both near Crew 1's start.
      // HAZARDS_FIRST_AT=never keeps moving storms out of these tests (they'd push the test ships around).
      env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "367", HAZARDS_FIRST_AT: "never" },
    },
    {
      // A second server for the EMP test: with seed 8 the first pack is an EMP at (800, 150), between the crews.
      // It serves the client built by the first server's command. STORM_STARTS_AT / STORM_CLOSED_AT make Last
      // Afloat's closing storm close from 0:02 to 0:12 (for the storm test; the EMP test plays Sink Count).
      command: `PORT=${EMP_PORT} npm start`,
      url: `http://localhost:${EMP_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "8", STORM_STARTS_AT: "2", STORM_CLOSED_AT: "12", HAZARDS_FIRST_AT: "never" },
    },
    {
      // A third server for the moving-storm test: the first dynamic hazard comes at 0:02. With seed 367 it is a
      // moving storm signalled 250 from Crew 2's start, which swallows Crew 2's waiting ship from about 0:08 to 0:15.
      command: `PORT=${HAZARD_PORT} npm start`,
      url: `http://localhost:${HAZARD_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "367", HAZARDS_FIRST_AT: "2" },
    },
  ],
});
