import { expect, test, type Page } from "@playwright/test";
import { GAME_PAGE, join, ownPosition, seatAs } from "./helpers.ts";

/** The part of the sea in view, as the scene reports it: top-left corner and size. */
async function viewOf(page: Page) {
  const [x, y, width, height] = (await page.locator("#game").getAttribute("data-view"))!.split(",").map(Number);
  return { x: x!, y: y!, width: width!, height: height! };
}

/** How far the view's centre is from where it should be: on the ship, kept inside the 1600 × 900 sea. */
async function offCentre(page: Page) {
  const view = await viewOf(page);
  const own = await ownPosition(page);
  const want = {
    x: Math.min(1600 - view.width / 2, Math.max(view.width / 2, own.x)),
    y: Math.min(900 - view.height / 2, Math.max(view.height / 2, own.y)),
  };
  return Math.hypot(view.x + view.width / 2 - want.x, view.y + view.height / 2 - want.y);
}

// Stage 5 slice 3: the follow camera and the minimap, tried with the test-only ?view=0.5 (half as much sea), and the
// game scene kept between matches.
test("camera: with half the view the camera follows your ship and the minimap shows; the usual view is unchanged", async ({ browser }) => {
  test.setTimeout(90_000);
  const ana = await (await browser.newContext()).newPage();
  await join(ana, "Ana", undefined, `${GAME_PAGE}&view=0.5`);
  const code = (await ana.textContent("#code"))!;
  await seatAs(ana, 1, "pilot");
  const ben = await (await browser.newContext()).newPage();
  await join(ben, "Ben", code);
  await seatAs(ben, 2, "pilot");

  await ana.click("#start");
  await expect(ana.locator("#game")).toHaveAttribute("data-view", /,800,450$/);
  await expect(ana.locator("#minimap")).toBeVisible();
  await expect(ana.locator("#minimap")).toHaveAttribute("data-dots", "0,1");
  // Ben's page has the usual view: the whole sea, no minimap.
  await expect(ben.locator("#game")).toHaveAttribute("data-view", "0,0,1600,900");
  await expect(ben.locator("#minimap")).toBeHidden();

  // Ana sails; her view keeps up with her ship (within the glide and the drawing delay).
  await expect(ana.locator("#countdown")).toBeHidden({ timeout: 15_000 });
  const before = await viewOf(ana);
  await ana.keyboard.down("W");
  await ana.keyboard.down("D");
  await ana.waitForTimeout(2500);
  await ana.keyboard.up("D");
  await ana.keyboard.up("W");
  await expect.poll(() => offCentre(ana), { timeout: 5_000 }).toBeLessThan(40);
  expect(await viewOf(ana)).not.toEqual(before);

  // Back to the lobby and a new match: the same game view (no new game loaded), still following.
  ana.on("dialog", (dialog) => void dialog.accept());
  await ana.click("#hud-exit");
  await expect(ana.locator("#scoreboard")).toBeVisible();
  await ana.click("#back-to-room");
  await expect(ana.locator("#room-screen")).toBeVisible();
  await expect(ana.locator("#minimap")).toBeHidden();
  await ben.click("#back-to-room");
  await ana.click("#start");
  await expect(ana.locator("#game")).toHaveAttribute("data-view", /,800,450$/);
  await expect(ana.locator("#minimap")).toBeVisible();
  await expect(ana.locator("#game")).toHaveAttribute("data-games", "1");
  await expect(ben.locator("#game")).toHaveAttribute("data-games", "1");
  await expect.poll(() => offCentre(ana), { timeout: 5_000 }).toBeLessThan(40);
});
