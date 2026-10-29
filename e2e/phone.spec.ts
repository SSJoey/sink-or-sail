import { expect, test } from "@playwright/test";
import { GAME_PAGE, seatAs } from "./helpers.ts";

// A landscape phone: touch is the main pointer.
test.use({ viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true });

test("phone: touch controls show for the pilot and the stick sails the ship", async ({ page }) => {
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Thumb");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await seatAs(page, 1, "pilot");
  await page.click("#start");
  await expect(page.locator("#game")).toHaveAttribute("data-ships", "2");

  await expect(page.locator("#btn-boost")).toBeVisible();
  await expect(page.locator("#btn-fire")).toBeHidden();
  await expect(page.locator("#stick-base")).toBeVisible();
  await expect(page.locator("#rotate")).toBeHidden();

  const ownX = async () => Number(await page.locator("#game").getAttribute("data-own-x"));
  const startX = await ownX();

  // Put a thumb down on the left half and push it to the right (east), using real touch events.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 150, y: 260 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 230, y: 260 }] });
  // The ship stays frozen through the 3-2-1 countdown, then sails.
  await expect.poll(ownX, { timeout: 9000 }).toBeGreaterThan(startX + 30);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
});

test("phone: the gunner's aiming stick aims without firing; only Fire fires", async ({ page }) => {
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Aimer");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await seatAs(page, 1, "gunner");
  await page.click("#start");
  await expect(page.locator("#btn-fire")).toBeVisible();
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 });

  const shots = async () => Number(await page.locator("#game").getAttribute("data-shots"));
  const cdp = await page.context().newCDPSession(page);

  // Aim: thumb down on the left half, swing it around for a second and a half. No Fire button.
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 150, y: 260, id: 1 }] });
  for (const [x, y] of [[210, 260], [150, 200], [90, 260], [150, 320], [210, 260]] as const) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(300);
  }
  expect(await shots()).toBe(0);

  // Holding Fire (second finger) does fire.
  const fire = (await page.locator("#btn-fire").boundingBox())!;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 210, y: 260, id: 1 }, { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 }],
  });
  await expect.poll(shots, { timeout: 3000 }).toBeGreaterThan(0);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
});

// Stage 4 slice 7: the 667 px fix. On a small phone held sideways, the host's top bar (role, crew, energy, packs,
// score, clock, sound, Pause, Exit) fits the screen and the energy bar keeps at least 120 px.
test("phone: on a 667 px screen the top bar fits and the energy bar keeps its width", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true })).newPage();
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Small");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await page.click("#start");
  await expect(page.locator("#hud-pause")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#hud-exit")).toBeVisible();
  const sizes = await page.evaluate(() => {
    const hud = document.getElementById("hud")!;
    const parts = [...hud.children].filter((el) => !(el as HTMLElement).hidden) as HTMLElement[];
    return {
      overflow: hud.scrollWidth - hud.clientWidth,
      right: Math.max(...parts.map((el) => el.getBoundingClientRect().right)) - window.innerWidth,
      energy: document.getElementById("hud-energy")!.getBoundingClientRect().width,
    };
  });
  expect(sizes.overflow).toBeLessThanOrEqual(0);
  expect(sizes.right).toBeLessThanOrEqual(0);
  expect(sizes.energy).toBeGreaterThanOrEqual(120);
});
