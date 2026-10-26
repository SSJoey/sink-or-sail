import { expect, test } from "@playwright/test";
import { join, ownPosition } from "./helpers.ts";

test("reefs: a ship sailing onto a reef slows down", async ({ page }) => {
  test.setTimeout(60_000);
  await join(page, "Reef");
  await page.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await expect(page.getByRole("button", { name: /Crew 1 · Pilot — Reef/ })).toBeVisible();
  // Twin Isles: Crew 1 starts at (150, 450) facing east; the middle reef lies across that line at x 710–890.
  await page.uncheck("#packs-toggle");
  await page.selectOption("#layout-select", "twinIsles");
  await expect(page.locator("#hazards-toggle")).toBeChecked();
  await expect(page.locator("#reefs-select")).toHaveValue("all");
  await page.click("#start");
  await expect(page.locator("#game")).toHaveAttribute("data-layout", "twinIsles");
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 });

  // Hold D and time the ship over open water (x 400–560) and on the reef, once it has slowed (x 770–870).
  const samples: { t: number; x: number }[] = [];
  await page.keyboard.down("d");
  await expect.poll(async () => {
    const { x } = await ownPosition(page);
    samples.push({ t: Date.now(), x });
    return x;
  }, { timeout: 20_000, intervals: [100] }).toBeGreaterThan(880);
  await page.keyboard.up("d");

  const speed = (from: number, to: number) => {
    const a = samples.find((s) => s.x >= from)!;
    const b = samples.find((s) => s.x >= to)!;
    return (b.x - a.x) / ((b.t - a.t) / 1000);
  };
  const open = speed(400, 560);
  const reef = speed(770, 870);
  expect(reef).toBeLessThan(open * 0.75);
});
