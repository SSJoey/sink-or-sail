import { expect, test } from "@playwright/test";
import { join } from "./helpers.ts";

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

  await host.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await two.getByRole("button", { name: /Crew 2 · Pilot — free/ }).click();
  await phone.getByRole("button", { name: /Crew 3 · Pilot — free/ }).click();
  await expect(host.getByRole("button", { name: /Crew 3 · Pilot — Three/ })).toBeVisible();
  await host.click("#start");

  for (const page of [host, two, phone]) await expect(page.locator("#game")).toHaveAttribute("data-ships", "3");
  await expect(phone.locator("#hud-role")).toHaveText("Pilot");
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
