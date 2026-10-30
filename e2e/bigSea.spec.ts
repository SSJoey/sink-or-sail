import { expect, test, type Page } from "@playwright/test";
import { GAME_PAGE, join, ownPosition, seatAs } from "./helpers.ts";

// Stage 5 slice 5: a bigger sea (the seventh test server's SEA_SIZE=3200x1800, with 2 ships): every player sees
// today's amount of sea round their ship, the camera follows, the minimap shows; a spectator sees the whole sea.
const BIG_SEA = "http://localhost:2583";
const SEA = { width: 3200, height: 1800 };

async function viewOf(page: Page) {
  const [x, y, width, height] = (await page.locator("#game").getAttribute("data-view"))!.split(",").map(Number);
  return { x: x!, y: y!, width: width!, height: height! };
}

/** How far the view's centre is from your ship (kept inside the sea). */
async function offCentre(page: Page) {
  const view = await viewOf(page);
  const own = await ownPosition(page);
  const want = {
    x: Math.min(SEA.width - view.width / 2, Math.max(view.width / 2, own.x)),
    y: Math.min(SEA.height - view.height / 2, Math.max(view.height / 2, own.y)),
  };
  return Math.hypot(view.x + view.width / 2 - want.x, view.y + view.height / 2 - want.y);
}

test("bigger sea: the view follows your ship, the minimap shows, a spectator sees the whole sea", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = async () => (await browser.newContext({ baseURL: BIG_SEA })).newPage();
  const ana = await page();
  await join(ana, "Ana");
  const code = (await ana.textContent("#code"))!;
  await seatAs(ana, 1, "pilot");
  const ben = await page();
  await join(ben, "Ben", code);
  await seatAs(ben, 2, "pilot");
  const tv = await page();
  await tv.goto(GAME_PAGE);
  await tv.fill("#name", "TV");
  await tv.fill("#code-input", code);
  await tv.click("#watch");
  await expect(tv.locator("#spectating")).toBeVisible();

  await ana.click("#start");
  // Players: today's amount of sea round their ship, and the minimap; the chart is drawn for the bigger sea.
  await expect(ana.locator("#game")).toHaveAttribute("data-view", /,1600,900$/);
  await expect(ana.locator("#minimap")).toBeVisible();
  await expect(ana.locator("#minimap")).toHaveAttribute("data-dots", "0,1");
  await expect(ben.locator("#game")).toHaveAttribute("data-view", /,1600,900$/);
  await expect(ana.locator("#game")).toHaveAttribute("data-chart", /^oneIsland:\d+:/);
  // Crew 1 starts west of the middle on the ring, far from today's left start.
  const own = await ownPosition(ana);
  expect(own.x).toBeGreaterThan(800);
  expect(Math.abs(own.y - 900)).toBeLessThan(5);
  await expect.poll(() => offCentre(ana), { timeout: 5_000 }).toBeLessThan(40);
  // The spectator: the whole sea, zoomed out to fit; no minimap needed.
  await expect(tv.locator("#game")).toHaveAttribute("data-view", "0,0,3200,1800");
  await expect(tv.locator("#minimap")).toBeHidden();

  // Ana sails east toward the middle; her view keeps up.
  await expect(ana.locator("#countdown")).toBeHidden({ timeout: 15_000 });
  await ana.keyboard.down("D");
  await ana.waitForTimeout(2000);
  await ana.keyboard.up("D");
  expect((await ownPosition(ana)).x).toBeGreaterThan(own.x + 100);
  await expect.poll(() => offCentre(ana), { timeout: 5_000 }).toBeLessThan(40);
});

test("favicon: the page names its icon and the server serves it", async ({ page }) => {
  await page.goto(GAME_PAGE);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
  const icon = await page.request.get("/favicon.svg");
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("svg");
});
