import { expect, test, type Page } from "@playwright/test";
import { join } from "./helpers.ts";

// The sixth test server sinks Crew 3's ship at 0:04 (TEST_SINK, playwright.config.ts). In a 1-life Last Afloat
// match its crew is then out, and its ghost appears where the ship sank at 0:06.
const BASE = "http://localhost:2582";
const PHONE = { viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true };

/** Crew 3's ghost's position, from the page's "ship:x,y;…" list. */
async function ghost(page: Page) {
  const entry = (await page.locator("#game").getAttribute("data-ghosts"))!.split(";").find((g) => g.startsWith("2:"))!;
  const [x, y] = entry.slice(2).split(",").map(Number);
  return { x: x!, y: y! };
}

test("ghosts: an out crew's ghost appears; its laptop pilot and its phone gunner both steer it", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = async (options = {}) => (await browser.newContext({ baseURL: BASE, ...options })).newPage();
  const host = await page();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const two = await page();
  await join(two, "Two", code);
  const pilot3 = await page();
  await join(pilot3, "Pilot3", code);
  const gunner3 = await page(PHONE);
  await join(gunner3, "Gunner3", code);
  await host.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await two.getByRole("button", { name: /Crew 2 · Pilot — free/ }).click();
  await pilot3.getByRole("button", { name: /Crew 3 · Pilot — free/ }).click();
  await gunner3.getByRole("button", { name: /Crew 3 · Gunner — free/ }).click();
  await host.getByRole("button", { name: "Last Afloat" }).click();
  await host.selectOption("#lives-select", "1");
  await expect(gunner3.locator("#mode-status")).toHaveText("Mode: Last Afloat · Lives: 1");
  await host.click("#start");

  // Under load the game view can take a while to appear (see the watch item in CLAUDE.md).
  await expect(pilot3.locator("#game")).toHaveAttribute("data-ghosts", /(^|;)2:/, { timeout: 20_000 });
  await expect(host.locator("#game")).toHaveAttribute("data-ghosts", /(^|;)2:/);
  await expect(host.locator("#game")).toHaveAttribute("data-ships", "2");

  // The laptop pilot steers it with D.
  const start = await ghost(pilot3);
  await pilot3.keyboard.down("d");
  await expect.poll(async () => (await ghost(pilot3)).x, { timeout: 5_000 }).toBeGreaterThan(start.x + 60);
  await pilot3.keyboard.up("d");

  // The phone gunner has the stick only (no buttons); pushing it up moves the ghost up (the gunner moved it last).
  await expect(gunner3.locator("#btn-fire")).toBeHidden();
  await expect(gunner3.locator("#btn-pack")).toBeHidden();
  const before = await ghost(gunner3);
  const cdp = await gunner3.context().newCDPSession(gunner3);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 150, y: 260, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 150, y: 200, id: 1 }] });
  await expect.poll(async () => (await ghost(gunner3)).y, { timeout: 5_000 }).toBeLessThan(before.y - 60);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
});
