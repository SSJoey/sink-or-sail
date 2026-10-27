import { expect, test, type Browser, type Page } from "@playwright/test";
import { join, ownPosition, sailWithKeys, seatAs, slotEmpty } from "./helpers.ts";

// With MATCH_SEED=367 (playwright.config.ts) the first pack is a mine at (450, 300), on the water at
// 0:11, and the second a torpedo at (450, 600), on the water at 0:22. Both are near Crew 1's start.
const MINE = { x: 450, y: 300 };
const TORPEDO = { x: 450, y: 600 };
const PHONE = { viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true };

/** Host takes Crew 1's pilot seat and starts; the pack appears at `target` (`type@x,y`). */
async function startAsPilot(page: Page, packPattern: RegExp) {
  await join(page, "Packer");
  await expect(page.locator("#packs-toggle")).toBeChecked(); // packs are on by default
  await seatAs(page, 1, "pilot");
  await page.click("#start");
  await expect(page.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · —");
  await expect(page.locator("#game")).toHaveAttribute("data-packs", packPattern, { timeout: 30_000 });
}

test("laptop: sail onto a mine pack with WASD, then drop the mine with E", async ({ page }) => {
  test.setTimeout(90_000);
  await startAsPilot(page, /mine@450,300/);
  await sailWithKeys(page, MINE, async () => !(await slotEmpty(page)));
  await expect(page.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: Mine · —");
  // Stage 3 pack icons: the top bar shows the mine's icon, with its name on hover.
  await expect(page.locator("#hud-pack img")).toHaveAttribute("alt", "Mine");
  await expect(page.locator("#hud-pack img")).toHaveAttribute("title", "Mine");

  await expect(page.locator("#game")).toHaveAttribute("data-mines", "0");
  await page.keyboard.press("e");
  await expect(page.locator("#game")).toHaveAttribute("data-mines", "1");
  await expect(page.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · —");
});

test.describe("phone", () => {
  test.use(PHONE);

  test("sail onto a mine pack with the touch stick; the lit Pack button drops it", async ({ page }) => {
    test.setTimeout(90_000);
    await startAsPilot(page, /mine@450,300/);
    await expect(page.locator("#btn-pack")).toBeVisible();
    await expect(page.locator("#btn-pack")).toHaveText("Pack");

    const cdp = await page.context().newCDPSession(page);
    const base = { x: 150, y: 260 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...base, id: 1 }] });
    for (const end = Date.now() + 40_000; Date.now() < end && (await slotEmpty(page)); ) {
      const own = await ownPosition(page);
      const dx = MINE.x - own.x;
      const dy = MINE.y - own.y;
      const length = Math.hypot(dx, dy) || 1;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: base.x + (dx / length) * 60, y: base.y + (dy / length) * 60, id: 1 }] });
      await page.waitForTimeout(150);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(page.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: Mine · —");
    await expect(page.locator("#btn-pack")).toHaveText("Mine");
    await expect(page.locator("#btn-pack img")).toBeVisible(); // the mine's icon above its name
    await expect(page.locator("#btn-pack")).toHaveClass(/lit/); // a mine is the pilot's pack

    const pack = (await page.locator("#btn-pack").boundingBox())!;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pack.x + pack.width / 2, y: pack.y + pack.height / 2, id: 2 }] });
    await expect(page.locator("#game")).toHaveAttribute("data-mines", "1");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · —");
    await expect(page.locator("#btn-pack")).not.toHaveClass(/lit/);
  });
});

/** A laptop pilot (host) and a gunner on `gunnerContext`, both on Crew 1; the pilot picks up the torpedo. */
async function crewWithTorpedo(browser: Browser, gunnerOptions: Parameters<Browser["newContext"]>[0]) {
  const pilot = await (await browser.newContext()).newPage();
  await join(pilot, "Pilot");
  const code = (await pilot.textContent("#code"))!;
  const gunner = await (await browser.newContext(gunnerOptions)).newPage();
  // Record vibration requests (headless Chrome has no vibration motor).
  await gunner.addInitScript(() => {
    const buzzes: number[] = [];
    (window as unknown as { buzzes: number[] }).buzzes = buzzes;
    navigator.vibrate = ((pattern: number) => { buzzes.push(pattern); return true; }) as Navigator["vibrate"];
  });
  await join(gunner, "Gunner", code);
  // Paired as they join: the pilot (host) and gunner make Crew 1.
  await seatAs(gunner, 1, "gunner");
  await seatAs(pilot, 1, "pilot");
  await pilot.click("#start");
  // Wait for the torpedo (the second pack), then sail onto it; the mine at (450, 300) is out of the way.
  await expect(pilot.locator("#game")).toHaveAttribute("data-packs", /torpedo@450,600/, { timeout: 40_000 });
  await sailWithKeys(pilot, TORPEDO, async () => !(await slotEmpty(pilot)));
  await expect(gunner.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · Torpedo"); // shown to both crewmates
  return { pilot, gunner };
}

test("laptop: the gunner fires the crew's torpedo with E", async ({ browser }) => {
  test.setTimeout(120_000);
  const { pilot, gunner } = await crewWithTorpedo(browser, {});
  await expect(gunner.locator("#game")).toHaveAttribute("data-torpedoes", "0");
  // The pilot's E does nothing for a torpedo.
  await pilot.keyboard.press("e");
  await pilot.waitForTimeout(300);
  await expect(pilot.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · Torpedo");

  await gunner.keyboard.press("e");
  await expect(gunner.locator("#game")).toHaveAttribute("data-torpedoes", "1");
  await expect(gunner.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · —");
});

test("phone: the gunner's lit Pack button fires the torpedo, after a buzz at pickup", async ({ browser }) => {
  test.setTimeout(120_000);
  const { gunner } = await crewWithTorpedo(browser, PHONE);
  await expect(gunner.locator("#btn-pack")).toHaveText("Torpedo");
  await expect(gunner.locator("#btn-pack")).toHaveClass(/lit/);
  expect(await gunner.evaluate(() => (window as unknown as { buzzes: number[] }).buzzes)).toEqual([200]);

  const cdp = await gunner.context().newCDPSession(gunner);
  const pack = (await gunner.locator("#btn-pack").boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pack.x + pack.width / 2, y: pack.y + pack.height / 2, id: 1 }] });
  await expect(gunner.locator("#game")).toHaveAttribute("data-torpedoes", "1");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(gunner.locator("#hud-pack")).toHaveAttribute("aria-label", "Packs: — · —");
});
