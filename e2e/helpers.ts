import { expect, type Page } from "@playwright/test";

/** Creates a room (no code) or joins one by code. */
export async function join(page: Page, name: string, code?: string) {
  await page.goto("/");
  await page.fill("#name", name);
  if (code) {
    await page.fill("#code-input", code);
    await page.click("#join");
  } else {
    await page.click("#create");
  }
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
}

export async function ownPosition(page: Page) {
  const x = Number(await page.locator("#game").getAttribute("data-own-x"));
  const y = Number(await page.locator("#game").getAttribute("data-own-y"));
  return { x, y };
}

export const slotEmpty = async (page: Page) => (await page.locator("#hud-pack").textContent()) === "Pack: —";

/** Steering gives up after this long (a busy machine makes each correction slower, so time, not a count). */
const SAIL_FOR_MS = 40_000;

/** Pilot on a laptop: hold W/A/S/D toward `target` until `done()` (default: within 15 of it). */
export async function sailWithKeys(page: Page, target: { x: number; y: number }, done?: () => Promise<boolean>) {
  const arrived = async () => {
    const own = await ownPosition(page);
    return Math.hypot(target.x - own.x, target.y - own.y) < 15;
  };
  const finished = done ?? arrived;
  const held = new Set<string>();
  const hold = async (key: string, down: boolean) => {
    if (down && !held.has(key)) { await page.keyboard.down(key); held.add(key); }
    if (!down && held.has(key)) { await page.keyboard.up(key); held.delete(key); }
  };
  for (const end = Date.now() + SAIL_FOR_MS; Date.now() < end && !(await finished()); ) {
    const own = await ownPosition(page);
    await hold("d", target.x - own.x > 10);
    await hold("a", target.x - own.x < -10);
    await hold("s", target.y - own.y > 10);
    await hold("w", target.y - own.y < -10);
    await page.waitForTimeout(150);
  }
  for (const key of [...held]) await page.keyboard.up(key);
}
