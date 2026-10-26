import { expect, test } from "@playwright/test";
import { join, sailWithKeys } from "./helpers.ts";

// With MATCH_SEED=367 (playwright.config.ts), One Island's wreck 1, at (1150, 125) up and left of Crew 2's
// start, holds a mine. Hazards and packs are on by default.
const WRECK = { x: 1150, y: 125 };

test("wrecks: the laptop gunner shoots a wreck to pieces; the pilot sails over the pack it held", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = async () => (await browser.newContext()).newPage();
  const gunner = await page();
  await join(gunner, "Gunner");
  const code = (await gunner.textContent("#code"))!;
  const pilot = await page();
  await join(pilot, "Pilot", code);
  await gunner.getByRole("button", { name: /Crew 2 · Gunner — free/ }).click();
  await pilot.getByRole("button", { name: /Crew 2 · Pilot — free/ }).click();
  await expect(gunner.locator("#hazards-toggle")).toBeChecked();
  await gunner.click("#start");

  const game = gunner.locator("#game");
  // Under load the game view can take a while to appear (see the watch item in CLAUDE.md).
  await expect(game).toHaveAttribute("data-wrecks", /(^|;)1:60:1(;|$)/, { timeout: 15_000 });
  await expect(gunner.locator("#countdown")).toBeHidden({ timeout: 10_000 });

  // Aim at the wreck and hold fire until it breaks (three shots).
  const box = (await gunner.locator("#game canvas").boundingBox())!;
  await gunner.mouse.move(box.x + (WRECK.x / 1600) * box.width, box.y + (WRECK.y / 900) * box.height);
  await gunner.mouse.down();
  await expect(game).not.toHaveAttribute("data-wrecks", /(^|;)1:/, { timeout: 10_000 });
  await gunner.mouse.up();
  await expect(game).toHaveAttribute("data-packs", /mine@1150,125/);

  // The pack can be taken at once: the pilot sails over it.
  await expect(pilot.locator("#hud-pack")).toHaveText("Packs: — · —");
  await sailWithKeys(pilot, WRECK, async () => (await pilot.locator("#hud-pack").textContent()) === "Packs: M · —");
  await expect(pilot.locator("#hud-pack")).toHaveText("Packs: M · —");
  await expect(gunner.locator("#hud-pack")).toHaveText("Packs: M · —");
});
