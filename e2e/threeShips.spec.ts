import { expect, test } from "@playwright/test";
import { join, seatAs } from "./helpers.ts";

test("three crews: a pilot in each crew gets 3 ships, and the top bar still fits a 667 px phone", async ({ browser }) => {
  const laptop = async () => (await browser.newContext()).newPage();
  const host = await laptop();
  await join(host, "One");
  const code = (await host.textContent("#code"))!;
  const two = await laptop();
  await join(two, "Two", code);
  // The smallest phone we play on, held sideways.
  const phone = await (await browser.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true })).newPage();
  await join(phone, "Three", code);

  // Paired as they join: One and Two make Crew 1, Three starts Crew 2 as pilot. Two then starts Crew 3 as its pilot.
  await seatAs(phone, 2, "pilot");
  await seatAs(two, 3, "pilot");
  await expect(host.locator("#crew-list li")).toHaveCount(3);
  await host.click("#start");

  // Under load the game view can take a while to appear (see the watch item in CLAUDE.md).
  for (const page of [host, two, phone]) await expect(page.locator("#game")).toHaveAttribute("data-ships", "3", { timeout: 15_000 });
  await expect(phone.locator("#hud-role")).toHaveText("Pilot · Frigate");
  await expect(phone.locator("#hud-score")).toContainText("▲ 0");

  // Every part of the top bar is on screen: nothing pushed past the right edge.
  await expect(phone.locator("#hud-pause")).toBeVisible();
  const overflow = await phone.evaluate(() => {
    const hud = document.getElementById("hud")!;
    const parts = [...hud.children].filter((el) => !(el as HTMLElement).hidden) as HTMLElement[];
    return { hud: hud.scrollWidth - hud.clientWidth, right: Math.max(...parts.map((el) => el.getBoundingClientRect().right)) - window.innerWidth };
  });
  expect(overflow.hud).toBeLessThanOrEqual(0);
  expect(overflow.right).toBeLessThanOrEqual(0);
});
