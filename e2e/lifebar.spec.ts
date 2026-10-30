import { expect, test } from "@playwright/test";
import { TUNING } from "@sink-or-sail/shared";
import { join, ownPosition, sailWithKeys, seatAs } from "./helpers.ts";

// Stage 3 slice 4: every ship's lifebar, the same for everyone. One Island's reefs (hazards on by default) take
// 5% of full health from a ship that sails onto one: Crew 1's ship sails onto the one at (700, 275).
const REEF = { x: 700, y: 275 };

test("lifebars: every ship's shows to everyone, and drops when a ship takes damage", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = async () => (await browser.newContext()).newPage();
  const host = await page();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const other = await page();
  await join(other, "Other", code);
  await seatAs(other, 2, "pilot");
  await host.uncheck("#packs-toggle"); // no health pack to top the bar up again
  await host.click("#start");

  await expect(other.locator("#game")).toHaveAttribute("data-lifebars", "0:1.00:green;1:1.00:green", { timeout: 15_000 });
  await expect(host.locator("#countdown")).toBeHidden({ timeout: 10_000 });
  // First east along the start line: steering straight for the reef holds W and D together (45°), a line that runs
  // into the wreck at (450, 125), whose bump also hurts. Then on to the reef until the other page sees a drop.
  await sailWithKeys(host, { x: 600, y: 450 }, async () => (await ownPosition(host)).x > 540);
  const fill = async () => Number((await other.locator("#game").getAttribute("data-lifebars"))?.match(/^0:([\d.]+):/)?.[1] ?? 1);
  await sailWithKeys(host, REEF, async () => (await fill()) < 1);
  // Under load the ship can cross the reef and be steered back in before the drop is read, so it may take more than
  // one hit (user's choice, 2026-10-30): the lifebar dropped by whole reef hits (5% each), green, the other ship's
  // untouched, and both pages show the same.
  await expect.poll(fill, { timeout: 5_000 }).toBeLessThan(1);
  await host.waitForTimeout(500);
  const bars = (await other.locator("#game").getAttribute("data-lifebars"))!;
  const [, value, colour] = bars.match(/^0:([\d.]+):(\w+);1:1\.00:green$/)!;
  const hits = (1 - Number(value)) / TUNING.reef.damage;
  expect(hits).toBeGreaterThanOrEqual(1);
  expect(Math.abs(hits - Math.round(hits))).toBeLessThan(0.11);
  expect(colour).toBe("green");
  await expect(host.locator("#game")).toHaveAttribute("data-lifebars", bars);
});
