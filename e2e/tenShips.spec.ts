import { expect, test, type Browser, type Page } from "@playwright/test";
import { GAME_PAGE } from "./helpers.ts";

/** A laptop that watches the room's matches (Stage 3 slice 8). */
async function watcher(browser: Browser, code: string): Promise<Page> {
  const tv = await (await browser.newContext()).newPage();
  await tv.goto(GAME_PAGE);
  await tv.fill("#name", "TV");
  await tv.fill("#code-input", code);
  await tv.click("#watch");
  await expect(tv.locator("#spectating")).toBeVisible();
  return tv;
}

const TEN_LABELS = ["0:● Ana + Bot", "1:■ Bots", "2:▲ Bots", "3:◆ Bots", "4:✚ Bots", "5:★ Bots", "6:▼ Bots", "7:⬟ Bots", "8:✖ Bots", "9:⬢ Bots"].join(";");

// Stage 5 slice 6: up to 10 crews. A host on a small phone plays with a bot partner and nine bot ships: 10 ships on
// the 4000 × 2250 sea, with today's view round the ship, the minimap, and the top bar showing the crew's own score.
// Slice 7: every ship's crew names under it, for everyone; a spectator sees the whole sea and the scoreboard panel.
test("ten ships: one player with a bot and nine bot ships, on a 667 px phone", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await (await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true })).newPage();
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Ana");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  const tv = await watcher(browser, (await page.textContent("#code"))!);
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
  // Slice 7: the names under every ship, the same for the player and the spectator; the panel only for the spectator.
  await expect(page.locator("#game")).toHaveAttribute("data-labels", TEN_LABELS);
  await expect(page.locator("#standings")).toBeHidden();
  await expect(tv.locator("#game")).toHaveAttribute("data-view", "0,0,4000,2250");
  await expect(tv.locator("#game")).toHaveAttribute("data-labels", TEN_LABELS);
  await expect(tv.locator("#standings")).toBeVisible();
  await expect(tv.locator("#standings tr")).toHaveCount(10);
  await expect(tv.locator('#standings tr[data-crew="0"]')).toHaveText(/^1st● Crew 1Ana \+ BotFrigate0$/);
  await expect(tv.locator('#standings tr[data-crew="9"]')).toHaveText(/^1st⬢ Crew 10BotsFrigate0$/);
  // The spectator's top bar: the timer and mode, no scores (they're in the panel).
  await expect(tv.locator("#hud-score")).toHaveText("");
  await expect(tv.locator("#hud-role")).toHaveText("Watching · Sink Count");
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

// Slice 7: in Last Afloat a spectator's top bar counts the ships afloat, and the panel shows each crew's hearts.
test("watching four ships in Last Afloat: ships afloat in the top bar, hearts in the panel", async ({ browser }) => {
  test.setTimeout(60_000);
  const host = await (await browser.newContext()).newPage();
  await host.goto(GAME_PAGE);
  await host.fill("#name", "Ana");
  await host.click("#create");
  await expect(host.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  const tv = await watcher(browser, (await host.textContent("#code"))!);
  await host.click("#play-bot");
  await host.getByRole("button", { name: "Last Afloat" }).click();
  await host.selectOption("#lives-select", "2");
  await host.selectOption("#bot-ships-select", "3");
  await expect(host.locator("#crew-list li")).toHaveCount(4);
  await host.click("#start");

  await expect(tv.locator("#game")).toHaveAttribute("data-ships", "4", { timeout: 15_000 });
  await expect(tv.locator("#hud-score")).toHaveText("4 of 4 afloat");
  await expect(tv.locator("#standings tr")).toHaveCount(4);
  await expect(tv.locator('#standings tr[data-crew="0"]')).toHaveText(/^1st● Crew 1Ana \+ BotFrigate♥♥$/);
  await expect(host.locator("#standings")).toBeHidden();
  await expect(host.locator("#game")).toHaveAttribute("data-labels", "0:● Ana + Bot;1:■ Bots;2:▲ Bots;3:◆ Bots");
});
