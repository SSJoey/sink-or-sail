import { expect, test } from "@playwright/test";
import { join } from "./helpers.ts";

// Stage 4 (2026-10-29), run in a group of its own (playwright.config.ts) so other tests' load doesn't add to the
// slowdown: the 3-2-1, the layout banner and the countdown beeps don't wait for the sea to load. With
// Chrome 20 times slower the scene's first frame comes at about 2.8 s, so they used to show only at "1".
test("a slow device still sees the countdown from the start, with the layout banner and the beeps", async ({ page }) => {
  test.setTimeout(60_000);
  await join(page, "Slow");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  await page.click("#start");
  await expect(page.locator("#countdown")).toHaveText(/^[23]$/, { timeout: 5_000 });
  await expect(page.locator("#banner")).toHaveText("Layout: One Island");
  await expect(page.locator("#game")).toHaveAttribute("data-beeps", /^count,count/, { timeout: 10_000 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});
