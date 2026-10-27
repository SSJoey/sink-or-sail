import { expect, test } from "@playwright/test";
import { join, ownPosition, sailWithKeys, seatAs } from "./helpers.ts";

// The fourth test server's first dynamic hazard comes at 0:02 (playwright.config.ts). With seed 3 it is a whirlpool
// at (305, 241), 260 from Crew 1's start; it forms at 0:05 and lasts until 0:20.
const BASE = "http://localhost:2580";
const POOL = { x: 305, y: 241 };
/** The whirlpool's eye radius (TUNING.whirlpool.eyeRadius). */
const EYE = 35;

test("whirlpool: signalled, then forms; the laptop pilot sails into the eye and it holds the ship there", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = async () => (await browser.newContext({ baseURL: BASE })).newPage();
  const host = await page();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const other = await page();
  await join(other, "Other", code);
  // The host is Crew 1's pilot (first to join); the other player is paired in as its gunner, then starts Crew 2.
  await seatAs(other, 2, "pilot");
  await expect(host.locator("#hazards-toggle")).toBeChecked();
  await host.click("#start");

  const game = host.locator("#game");
  // Under load the game view can take a while to appear (see the watch item in CLAUDE.md).
  await expect(game).toHaveAttribute("data-hazards", /^0:whirlpool:(signalled|active):305,241$/, { timeout: 15_000 });
  await expect(game).toHaveAttribute("data-hazards", /^0:whirlpool:active:/, { timeout: 15_000 });

  const fromEye = async () => {
    const own = await ownPosition(host);
    return Math.hypot(own.x - POOL.x, own.y - POOL.y);
  };
  await sailWithKeys(host, POOL, async () => (await fromEye()) < 20);
  // With the keys let go, the eye keeps the ship in it (its pull is stronger than full sail).
  for (let i = 0; i < 8; i++) {
    expect(await fromEye()).toBeLessThan(EYE + 5);
    await host.waitForTimeout(250);
  }
});
