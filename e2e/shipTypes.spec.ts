import { expect, test } from "@playwright/test";
import { join, seatAs } from "./helpers.ts";

test("ship types: the pilot picks a Cutter on a laptop, the gunner sees it, and the match sails a Cutter", async ({ browser }) => {
  const ana = await (await browser.newContext()).newPage();
  await join(ana, "Ana");
  const code = (await ana.textContent("#code"))!;
  await seatAs(ana, 1, "pilot");
  const ben = await (await browser.newContext()).newPage();
  await join(ben, "Ben", code);
  await expect(ben.locator("#my-crew")).toHaveAttribute("data-role", "gunner");

  // The pilot picks; the gunner sees the name (no dropdown) and the crew list shows it too.
  await expect(ana.locator("#ship-type-pick")).toBeVisible();
  await expect(ben.locator("#ship-type-pick")).toBeHidden();
  await ana.selectOption("#ship-type-pick", "cutter");
  await expect(ben.locator("#ship-type-name")).toHaveText("Cutter");
  await expect(ben.locator("#ship-type-who")).toHaveText("(your pilot picks)");
  await expect(ben.locator("#ship-type-facts")).toHaveText("Health 75 · speed 175 · range 450 · fires every 0.3 s");
  await expect(ana.locator('#crew-list li[data-crew="0"] .crew-ship')).toHaveText("Cutter");

  // Ready locks the pick.
  await ana.click("#ready");
  await expect(ana.locator("#ship-type-pick")).toBeDisabled();

  await ana.click("#start");
  await expect(ana.locator("#game")).toHaveAttribute("data-types", "cutter,frigate");
  await expect(ana.locator("#hud-role")).toHaveText("Pilot · Cutter");
  await expect(ben.locator("#hud-role")).toHaveText("Gunner · Cutter");
  await expect(ben.locator("#game")).toHaveAttribute("data-lifebars", /0:1\.00:green/);
});
