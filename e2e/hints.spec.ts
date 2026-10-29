import { expect, test } from "@playwright/test";
import { GAME_PAGE, seatAs } from "./helpers.ts";

// Stage 4 slice 8: first-match control hints, until each control is first used on this device.
const PHONE = { viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true };

test("hints: a phone gunner sees Hold to fire until firing; the device remembers it for the next match", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await (await browser.newContext(PHONE)).newPage();
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Newbie");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await seatAs(page, 1, "gunner");
  await page.click("#start");
  await expect(page.locator("#hint-fire")).toHaveText("Hold to fire", { timeout: 15_000 });
  await expect(page.locator("#hint-shield")).toHaveText("Hold to block shots (uses energy)");
  await expect(page.locator("#hint-left")).toHaveText("Touch anywhere on this side to aim");
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 });

  const cdp = await page.context().newCDPSession(page);
  const fire = (await page.locator("#btn-fire").boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 1 }] });
  await expect(page.locator("#hint-fire")).toBeHidden({ timeout: 5_000 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("#hint-shield")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sinkOrSail.hints"))).toContain("phone:gunner:fire");

  // The next match: Fire's hint stays gone; Shield's (never used) is back.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.locator("#hud-exit").click();
  await expect(page.locator("#scoreboard")).toBeVisible();
  await page.locator("#play-again").click();
  await expect(page.locator("#hint-shield")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#hint-fire")).toBeHidden();
});

test("hints: a laptop pilot sees one line of keys until steering and boosting", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Keys");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await page.click("#start");
  await expect(page.locator("#hint-keys")).toHaveText("W A S D steer · Space boost · E drop the mine", { timeout: 15_000 });
  await expect(page.locator("#hint-fire")).toBeHidden();
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 });
  await page.keyboard.down("w");
  await page.waitForTimeout(400);
  await expect(page.locator("#hint-keys")).toBeVisible();
  await page.keyboard.down("Space");
  await expect(page.locator("#hint-keys")).toBeHidden({ timeout: 5_000 });
  await page.keyboard.up("Space");
  await page.keyboard.up("w");
});
