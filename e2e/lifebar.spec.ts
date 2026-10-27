import { expect, test } from "@playwright/test";
import { join, sailWithKeys, seatAs } from "./helpers.ts";

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
  await sailWithKeys(host, REEF, async () => (await other.locator("#game").getAttribute("data-lifebars"))?.startsWith("0:0.95:") ?? false);
  await expect(other.locator("#game")).toHaveAttribute("data-lifebars", /^0:0\.95:green;1:1\.00:green$/);
  await expect(host.locator("#game")).toHaveAttribute("data-lifebars", /^0:0\.95:green;/);
});
