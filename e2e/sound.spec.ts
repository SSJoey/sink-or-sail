import { expect, test } from "@playwright/test";
import { join } from "./helpers.ts";

// Stage 4 slice 1: the countdown beeps and the speaker switch. A test can't hear, so the page lists the beeps it
// played in data-beeps.
test("sound: the countdown beeps 3, 2, 1, Go!; the speaker switch turns beeps off, for the next match too", async ({ page }) => {
  test.setTimeout(60_000);
  await join(page, "Ana");
  await page.click("#start");
  await expect(page.locator("#hud-sound")).toHaveText("🔊");
  await expect(page.locator("#game")).toHaveAttribute("data-beeps", "count,count,count,go", { timeout: 15_000 });

  await page.click("#hud-sound");
  await expect(page.locator("#hud-sound")).toHaveText("🔇");
  expect(await page.evaluate(() => localStorage.getItem("sinkOrSail.sound"))).toBe("off");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.click("#hud-exit");
  await expect(page.locator("#scoreboard")).toBeVisible();
  await page.click("#play-again");
  await expect(page.locator("#countdown")).toHaveText(/^[123]$/, { timeout: 10_000 });
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 });
  await expect(page.locator("#hud-sound")).toHaveText("🔇");
  await expect(page.locator("#game")).toHaveAttribute("data-beeps", "count,count,count,go");
});
