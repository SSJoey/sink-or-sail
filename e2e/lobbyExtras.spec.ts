import { expect, test } from "@playwright/test";
import { join, seatAs } from "./helpers.ts";

const PHONE = { viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true };

// Stage 5 slice 4: the ship and layout outlines in the lobby, the laptop controls legend and a tip at the start.
test("lobby outlines, the laptop legend (not on phones) and a tip at the start", async ({ browser }) => {
  test.setTimeout(90_000);
  const ana = await (await browser.newContext()).newPage();
  await join(ana, "Ana");
  const code = (await ana.textContent("#code"))!;
  await seatAs(ana, 1, "pilot");
  const ben = await (await browser.newContext(PHONE)).newPage();
  await join(ben, "Ben", code);
  await expect(ben.locator("#my-crew")).toHaveAttribute("data-role", "gunner");

  // The picked ship's outline: a Frigate, then the pilot picks a Cutter and both see its outline.
  await expect(ana.locator("#ship-type-hull")).toHaveAttribute("data-type", "frigate");
  const frigate = await ana.locator("#ship-type-hull path").getAttribute("d");
  await ana.selectOption("#ship-type-pick", "cutter");
  await expect(ana.locator("#ship-type-hull")).toHaveAttribute("data-type", "cutter");
  await expect(ben.locator("#ship-type-hull")).toHaveAttribute("data-type", "cutter");
  expect(await ana.locator("#ship-type-hull path").getAttribute("d")).not.toBe(frigate);

  // The layout's outline, for everyone: One Island by default, Twin Isles with its reefs, "?" for Random.
  await expect(ben.locator("#layout-chart")).toHaveAttribute("data-layout", "oneIsland");
  await ana.selectOption("#layout-select", "twinIsles");
  await expect(ben.locator("#layout-chart")).toHaveAttribute("data-layout", "twinIsles");
  await expect(ben.locator("#layout-chart")).toHaveAttribute("data-islands", "2");
  await expect(ben.locator("#layout-chart")).not.toHaveAttribute("data-reefs", "0");
  await ana.selectOption("#layout-select", "random");
  await expect(ana.locator("#layout-chart")).toHaveAttribute("data-layout", "random");
  await expect(ana.locator("#layout-random")).toBeVisible();
  await ana.selectOption("#layout-select", "oneIsland");

  // A tip shows during the 3-2-1, on both devices.
  await ana.click("#start");
  await expect(ana.locator("#countdown")).toHaveText(/^[123]$/);
  await expect(ana.locator("#tip")).toBeVisible();
  await expect(ana.locator("#tip")).not.toHaveText("");
  await expect(ben.locator("#tip")).toBeVisible();

  // The legend: the pilot's keys on the laptop, none on the phone. Hide is remembered; Keys brings it back.
  await expect(ana.locator("#legend")).toBeVisible();
  await expect(ana.locator("#legend td")).toHaveText(["W A S D", "Steer", "Space", "Boost", "E", "Drop the mine"]);
  await expect(ben.locator("#legend")).toBeHidden();
  await expect(ben.locator("#legend-show")).toBeHidden();
  await ana.click("#legend-hide");
  await expect(ana.locator("#legend")).toBeHidden();
  await expect(ana.locator("#legend-show")).toBeVisible();
  expect(await ana.evaluate(() => localStorage.getItem("sink-or-sail:legendHidden"))).toBe("1");
  await ana.click("#legend-show");
  await expect(ana.locator("#legend")).toBeVisible();

  // The tip goes 3 s after Go.
  await expect(ana.locator("#countdown")).toBeHidden({ timeout: 15_000 });
  await expect(ana.locator("#tip")).toBeHidden({ timeout: 10_000 });
});
