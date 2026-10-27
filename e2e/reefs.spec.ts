import { expect, test } from "@playwright/test";
import { join, ownPosition, seatAs } from "./helpers.ts";

test("reefs: a ship sailing onto a reef slows down", async ({ page }) => {
  test.setTimeout(60_000);
  await join(page, "Reef");
  await seatAs(page, 1, "pilot");
  // Twin Isles: Crew 1 starts at (150, 450) facing east; the middle reef lies across that line at x 710–890.
  await page.uncheck("#packs-toggle");
  await page.selectOption("#layout-select", "twinIsles");
  await expect(page.locator("#hazards-toggle")).toBeChecked();
  await expect(page.locator("#reefs-select")).toHaveValue("all");
  await page.click("#start");
  await expect(page.locator("#game")).toHaveAttribute("data-layout", "twinIsles");
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 });

  // Hold D and time the ship over open water (x 400–560) and on the reef, once it has slowed (x 770–870).
  // The page itself records every change of the ship's x with its time, so a slow test machine can't skip a stretch.
  await page.evaluate(() => {
    const game = document.getElementById("game")!;
    const samples: { t: number; x: number }[] = [];
    (window as unknown as { reefSamples: typeof samples }).reefSamples = samples;
    new MutationObserver(() => samples.push({ t: performance.now(), x: Number(game.dataset.ownX) })).observe(game, { attributeFilter: ["data-own-x"] });
  });
  await page.keyboard.down("d");
  await expect.poll(async () => (await ownPosition(page)).x, { timeout: 20_000, intervals: [100] }).toBeGreaterThan(880);
  await page.keyboard.up("d");
  const samples = await page.evaluate(() => (window as unknown as { reefSamples: { t: number; x: number }[] }).reefSamples);

  const speed = (from: number, to: number) => {
    const a = samples.find((s) => s.x >= from)!;
    const b = samples.find((s) => s.x >= to)!;
    return (b.x - a.x) / ((b.t - a.t) / 1000);
  };
  const open = speed(400, 560);
  const reef = speed(770, 870);
  expect(reef).toBeLessThan(open * 0.75);
});
