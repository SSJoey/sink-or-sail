import { expect, test } from "@playwright/test";
import { join, ownPosition, sailWithKeys, seatAs, slotEmpty } from "./helpers.ts";

// This test runs against the second test server (playwright.config.ts): MATCH_SEED=8 puts an EMP first,
// at (800, 150), on the water at 0:11.
test.use({ baseURL: "http://localhost:2578" });

const EMP = { x: 800, y: 150 };

test("the gunner's EMP disables the enemy ship in range; its crew sees it and can still steer", async ({ browser }) => {
  test.setTimeout(150_000);
  const page = async () => (await browser.newContext({ baseURL: "http://localhost:2578" })).newPage();
  const pilot = await page();
  await join(pilot, "Pilot");
  const code = (await pilot.textContent("#code"))!;
  const gunner = await page();
  await join(gunner, "Gunner", code);
  const enemy = await page();
  await join(enemy, "Enemy", code);
  // Players are paired into crews as they join: Crew 1's pilot and gunner, then Crew 2's pilot.
  await seatAs(gunner, 1, "gunner");
  await seatAs(enemy, 2, "pilot");
  await seatAs(pilot, 1, "pilot");
  await pilot.click("#start");

  // Crew 1 picks up the EMP, approaching level with it from the left (straight in, so drift can't carry the
  // ship past it). The enemy pilot waits to the right of the spot.
  await expect(pilot.locator("#game")).toHaveAttribute("data-packs", /emp@800,150/, { timeout: 40_000 });
  const lineUp = { x: EMP.x - 150, y: EMP.y };
  await Promise.all([
    (async () => {
      await sailWithKeys(pilot, lineUp, async () => {
        const own = await ownPosition(pilot);
        return Math.hypot(lineUp.x - own.x, lineUp.y - own.y) < 30;
      });
      await sailWithKeys(pilot, EMP, async () => !(await slotEmpty(pilot)));
    })(),
    sailWithKeys(enemy, { x: EMP.x + 200, y: EMP.y }),
  ]);
  await expect(gunner.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · EMP");
  await expect(gunner.locator("#game")).toHaveAttribute("data-disabled", "00");

  // Close in on the enemy until well inside the EMP's reach (28 + 200 = 228 between centres).
  const gap = async () => {
    const a = await ownPosition(pilot);
    const b = await ownPosition(enemy);
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const enemyAt = await ownPosition(enemy);
  await sailWithKeys(pilot, enemyAt, async () => (await gap()) < 150);
  await pilot.waitForTimeout(500); // let the ship settle after letting go of the keys
  expect(await gap()).toBeLessThan(200);

  // The pilot's E does nothing for an EMP; the gunner's fires it.
  await pilot.keyboard.press("e");
  await pilot.waitForTimeout(300);
  await expect(pilot.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · EMP");
  await gunner.keyboard.press("e");

  await expect(gunner.locator("#game")).toHaveAttribute("data-disabled", "01");
  await expect(gunner.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · —");
  await expect(enemy.locator("#hud-emp")).toHaveText(/^EMP [1-3]$/);

  // Caught but still steering: the enemy ship moves when its pilot steers.
  const before = Number(await enemy.locator("#game").getAttribute("data-own-y"));
  await enemy.keyboard.down("s");
  await expect.poll(async () => Number(await enemy.locator("#game").getAttribute("data-own-y")), { timeout: 3000 }).toBeGreaterThan(before + 15);
  await enemy.keyboard.up("s");

  // It wears off after 3 s.
  await expect(enemy.locator("#hud-emp")).toHaveText("", { timeout: 6000 });
  await expect(gunner.locator("#game")).toHaveAttribute("data-disabled", "00");
});
