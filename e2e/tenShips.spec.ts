import { expect, test } from "@playwright/test";
import { GAME_PAGE } from "./helpers.ts";

// Stage 5 slice 6: up to 10 crews. A host on a small phone plays with a bot partner and nine bot ships: 10 ships on
// the 4000 × 2250 sea, with today's view round the ship, the minimap, and the top bar showing the crew's own score.
test("ten ships: one player with a bot and nine bot ships, on a 667 px phone", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await (await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true })).newPage();
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Ana");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await page.click("#play-bot");
  await page.selectOption("#bot-ships-select", "9");
  await expect(page.locator("#crew-list li")).toHaveCount(10);
  await expect(page.locator('#crew-list li[data-crew="9"]')).toContainText("Bot & Bot (bot ship)");
  await page.click("#start");

  await expect(page.locator("#game")).toHaveAttribute("data-ships", "10", { timeout: 15_000 });
  await expect(page.locator("#game")).toHaveAttribute("data-view", /,1600,900$/);
  await expect(page.locator("#minimap")).toBeVisible();
  await expect(page.locator("#minimap")).toHaveAttribute("data-dots", "0,1,2,3,4,5,6,7,8,9");
  await expect(page.locator("#hud-score")).toHaveText("● 0 · 1st of 10");
  // The top bar still fits, and the energy bar keeps its width (Stage 4's 667 px fix).
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
