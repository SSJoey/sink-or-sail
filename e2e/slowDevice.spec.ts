import { expect, test } from "@playwright/test";
import { GAME_PAGE } from "./helpers.ts";

// Stage 4 (2026-10-29/30): on a slow device the sea can take seconds to load. The 3-2-1, the layout banner, the
// countdown beeps and the top bar don't wait for it. The page's test-only ?sceneDelay=4000 starts the scene after
// the whole countdown, so the test is the same however busy the machine is. Run in a group of its own
// (playwright.config.ts).
test("a slow device still sees the countdown, the layout banner, the beeps and the top bar before the sea loads", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`${GAME_PAGE}&sceneDelay=4000`);
  await page.fill("#name", "Slow");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  // The page notes what the countdown said when the top bar's role and empty pack slots first appeared.
  await page.evaluate(() => {
    const seen: Record<string, string> = {};
    (window as unknown as { seen: Record<string, string> }).seen = seen;
    const countdown = () => document.getElementById("countdown")!.textContent ?? "";
    new MutationObserver(() => {
      if (!seen.role && document.getElementById("hud-role")!.textContent === "Pilot · Frigate") seen.role = countdown();
      if (!seen.packs && document.getElementById("hud-pack")!.getAttribute("aria-label") === "Packs: — · —") seen.packs = countdown();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await page.click("#start");
  await expect(page.locator("#countdown")).toHaveText("3");
  await expect(page.locator("#banner")).toHaveText("Layout: One Island");
  await expect(page.locator("#game")).toHaveAttribute("data-beeps", "count,count,count,go", { timeout: 10_000 });
  // All that while the sea still hadn't drawn (the scene reports the ships it drew only once it runs).
  await expect(page.locator("#game")).not.toHaveAttribute("data-ships", /./);
  expect(await page.evaluate(() => (window as unknown as { seen: Record<string, string> }).seen)).toEqual({ role: "3", packs: "3" });
  // Then the sea arrives.
  await expect(page.locator("#game")).toHaveAttribute("data-ships", "2", { timeout: 10_000 });
});
