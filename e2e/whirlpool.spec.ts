import { expect, test } from "@playwright/test";
import { join, ownPosition, sailWithKeys } from "./helpers.ts";

// The fourth test server's first dynamic hazard comes at 0:02 (playwright.config.ts). With seed 8 it is a whirlpool
// at (409, 433), 260 east of Crew 1's start; it forms at 0:05 and lasts until 0:20.
const BASE = "http://localhost:2580";
const POOL = { x: 409, y: 433 };
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
  await host.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await other.getByRole("button", { name: /Crew 2 · Pilot — free/ }).click();
  await expect(host.locator("#hazards-toggle")).toBeChecked();
  await host.click("#start");

  const game = host.locator("#game");
  // Under load the game view can take a while to appear (see the watch item in CLAUDE.md).
  await expect(game).toHaveAttribute("data-hazards", /^0:whirlpool:(signalled|active):409,433$/, { timeout: 15_000 });
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
