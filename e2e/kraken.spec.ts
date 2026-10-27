import { expect, test } from "@playwright/test";
import { join, ownPosition, seatAs } from "./helpers.ts";

// The fifth test server's first dynamic hazard comes at 0:02 (playwright.config.ts). With seed 8 it is a kraken
// surfacing at (449, 430), 300 from Crew 1's start; it swims to Crew 1's waiting ship, grabs it at about 0:09,
// holds it 3 s and lets go.
const BASE = "http://localhost:2581";

test("kraken: surfaces, grabs the waiting ship, holds it still and hurts it, then lets go", async ({ browser }) => {
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
  await expect(game).toHaveAttribute("data-hazards", /^0:kraken:(signalled|active):/, { timeout: 15_000 });
  await expect(game).toHaveAttribute("data-held", "0", { timeout: 15_000 });

  // Held: full ahead does nothing, and the ship loses health.
  const at = await ownPosition(host);
  await host.keyboard.down("d");
  await host.waitForTimeout(800);
  const still = await ownPosition(host);
  expect(Math.hypot(still.x - at.x, still.y - at.y)).toBeLessThan(2);
  await expect.poll(async () => Number(await game.getAttribute("data-own-health")), { timeout: 5_000 }).toBeLessThan(100);

  // Let go after the hold: the ship sails off with the key still down.
  await expect(game).toHaveAttribute("data-held", "", { timeout: 5_000 });
  await expect.poll(async () => (await ownPosition(host)).x, { timeout: 5_000 }).toBeGreaterThan(still.x + 20);
  await host.keyboard.up("d");
});
