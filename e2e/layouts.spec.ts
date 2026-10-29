import { expect, test } from "@playwright/test";
import { join, seatAs } from "./helpers.ts";

test("layouts: the host picks Slalom and every page draws it; Random then picks a different one", async ({ browser }) => {
  const page = async () => (await browser.newContext()).newPage();
  const host = await page();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const other = await page();
  await join(other, "Other", code);
  // The host is Crew 1's pilot (first to join); the other player is paired in as its gunner, then starts Crew 2.
  await seatAs(other, 2, "pilot");

  await host.selectOption("#layout-select", "slalom");
  await expect(other.locator("#layout-status")).toHaveText("Layout: Slalom");
  await host.click("#start");
  await expect(host.locator("#banner")).toHaveText("Layout: Slalom");
  for (const p of [host, other]) await expect(p.locator("#game")).toHaveAttribute("data-layout", "slalom");
  // Stage 4: every page drew the sea chart for Slalom (layout, then wave squiggles, palms and reef marks).
  for (const p of [host, other]) await expect(p.locator("#game")).toHaveAttribute("data-chart", /^slalom:[1-9]\d*:\d+:\d+$/);
  expect(await host.locator("#game").getAttribute("data-chart")).toBe(await other.locator("#game").getAttribute("data-chart"));

  host.once("dialog", (dialog) => void dialog.accept());
  await host.click("#hud-exit");
  await expect(host.locator("#result")).toContainText("Layout: Slalom");
  await host.click("#back-to-room");

  // Random never repeats the last layout, so the next match isn't Slalom.
  await host.selectOption("#layout-select", "random");
  await expect(other.locator("#layout-status")).toHaveText(/^Layout: Random/);
  await host.click("#start");
  await expect(host.locator("#banner")).toHaveText(/^Layout: Random → /);
  await expect(host.locator("#banner")).not.toContainText("Slalom");
  await expect(host.locator("#game")).not.toHaveAttribute("data-layout", "slalom");
  const picked = (await host.locator("#game").getAttribute("data-layout"))!;
  await expect(other.locator("#game")).toHaveAttribute("data-layout", picked);
});
