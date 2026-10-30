import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 2577;
/** Second test server, for the EMP test (its own MATCH_SEED) and the closing-storm test (a sooner storm). */
export const EMP_PORT = 2578;
/** Third to fifth test servers, for the moving-storm, whirlpool and kraken tests (dynamic hazards from 0:02). */
export const HAZARD_PORT = 2579;
export const WHIRLPOOL_PORT = 2580;
export const KRAKEN_PORT = 2581;
/** Sixth test server, for the ghost test: TEST_SINK sinks Crew 2 at 0:04. */
export const GHOST_PORT = 2582;
/** Seventh test server, for the bigger-sea test (Stage 5): SEA_SIZE gives every match a 3200 × 1800 sea. */
export const BIG_SEA_PORT = 2583;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  reporter: "list",
  // Two tests at a time: with four, the game pages saturated the laptop's 8 cores and tests read ship positions late
  // (reliability slice, 2026-10-27).
  workers: 2,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The installed Google Chrome, so Playwright needs no browser download.
    channel: "chrome",
    headless: true,
    // Draw on the laptop's graphics chip (Intel Iris Xe, through Vulkan) instead of in software: headless Chrome's
    // software drawing kept the machine so busy that tests read ship positions late (reliability slice, 2026-10-27).
    launchOptions: { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=vulkan", "--enable-features=Vulkan"] },
  },
  // Tests with many pages (the 3-ship test: 3, the ghost test: 4) run on their own, one after the other, after the
  // rest: run next to another test they slowed the machine enough for the smoke test to miss the 3-2-1 countdown
  // (Stage 2 slice 9a, 2026-10-27). A group only runs when the one before it passed.
  projects: [
    { name: "main", testIgnore: [/threeShips\.spec\.ts/, /ghosts\.spec\.ts/, /slowDevice\.spec\.ts/] },
    { name: "three ships", testMatch: /threeShips\.spec\.ts/, dependencies: ["main"] },
    { name: "ghosts", testMatch: /ghosts\.spec\.ts/, dependencies: ["three ships"] },
    // Stage 4: a page with Chrome slowed down on purpose, on its own so the machine is otherwise quiet.
    { name: "slow device", testMatch: /slowDevice\.spec\.ts/, dependencies: ["ghosts"] },
  ],
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
      // JOIN_ADDRESS is a documentation-only address (192.0.2.0/24), for checking the room screen's QR code link.
      env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "367", HAZARDS_FIRST_AT: "never", JOIN_ADDRESS: "192.0.2.10" },
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
      // A third server for the moving-storm test: the first dynamic hazard comes at 0:02. With seed 14 it is a
      // moving storm signalled 250 from Crew 2's start, which swallows Crew 2's waiting ship from about 0:08 to 0:19.
      command: `PORT=${HAZARD_PORT} npm start`,
      url: `http://localhost:${HAZARD_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "14", HAZARDS_FIRST_AT: "2" },
    },
    {
      // A fourth server for the whirlpool test: with seed 3 the first dynamic hazard (at 0:02) is a whirlpool at
      // (305, 241), 260 from Crew 1's start, forming at 0:05 and lasting until 0:20.
      command: `PORT=${WHIRLPOOL_PORT} npm start`,
      url: `http://localhost:${WHIRLPOOL_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "3", HAZARDS_FIRST_AT: "2" },
    },
    {
      // A fifth server for the kraken test: with seed 8 the first dynamic hazard (at 0:02) is a kraken surfacing at
      // (449, 430), 300 from Crew 1's start; it grabs Crew 1's waiting ship at about 0:09 and lets go at about 0:12.
      command: `PORT=${KRAKEN_PORT} npm start`,
      url: `http://localhost:${KRAKEN_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "8", HAZARDS_FIRST_AT: "2" },
    },
    {
      // A sixth server for the ghost test: TEST_SINK sinks Crew 2's ship at 0:04 (in a 1-life Last Afloat match its
      // crew is out, and its ghost appears at 0:06). The hazard timer's first hazard is far off (999 s), so haunting
      // is on but no timer hazard comes during the test.
      command: `PORT=${GHOST_PORT} npm start`,
      url: `http://localhost:${GHOST_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "367", HAZARDS_FIRST_AT: "999", TEST_SINK: "2@4" },
    },
    {
      // A seventh server for the bigger-sea test (Stage 5): SEA_SIZE gives every match a 3200 × 1800 sea, whatever
      // its number of ships, and HAZARDS_FIRST_AT=never keeps moving storms away.
      command: `PORT=${BIG_SEA_PORT} npm start`,
      url: `http://localhost:${BIG_SEA_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs"), MATCH_SEED: "367", HAZARDS_FIRST_AT: "never", SEA_SIZE: "3200x1800" },
    },
  ],
});
