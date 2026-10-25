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

export const slotEmpty = async (page: Page) => (await page.locator("#hud-pack").textContent()) === "Packs: — · —";

/** Steering gives up after this long (a busy machine makes each correction slower, so time, not a count). */
const SAIL_FOR_MS = 40_000;

/** Within this distance of the target, steering eases off (see `sailWithKeys`). */
const EASE_WITHIN = 120;
/** A ship this close but moving well off the target's direction goes round again from this far out. */
const GO_ROUND_WITHIN = 100;
const GO_ROUND_TO = 170;

/**
 * Pilot on a laptop: hold W/A/S/D toward `target` until `done()` (default: within 15 of it).
 * Far away the keys stay held. Close in, each correction is a short tap followed by a pause with the keys
 * released, so the ship slows down instead of overshooting: on a busy machine the position is read late.
 * A ship that arrives side-on can only circle the target (its turning circle is wider than the target), so
 * when it is close but moving more than 60° off the target's direction, it sails out and comes back straight.
 */
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
  const releaseAll = async () => { for (const key of [...held]) await hold(key, false); };
  const steer = async (dx: number, dy: number) => {
    await hold("d", dx > 10);
    await hold("a", dx < -10);
    await hold("s", dy > 10);
    await hold("w", dy < -10);
  };
  let last = await ownPosition(page);
  let goingRound = false;
  for (const end = Date.now() + SAIL_FOR_MS; Date.now() < end && !(await finished()); ) {
    const own = await ownPosition(page);
    const dx = target.x - own.x;
    const dy = target.y - own.y;
    const distance = Math.hypot(dx, dy);
    const vx = own.x - last.x;
    const vy = own.y - last.y;
    last = own;
    const moving = Math.hypot(vx, vy) > 2;
    const offCourse = moving && (vx * dx + vy * dy) / (Math.hypot(vx, vy) * distance) < Math.cos(Math.PI / 3);
    if (distance < GO_ROUND_WITHIN && offCourse && !goingRound) goingRound = true;
    if (distance > GO_ROUND_TO) goingRound = false;
    if (goingRound) {
      await steer(-dx, -dy);
      await page.waitForTimeout(150);
    } else if (distance < EASE_WITHIN) {
      await steer(dx, dy);
      await page.waitForTimeout(120);
      await releaseAll();
      await page.waitForTimeout(350);
    } else {
      await steer(dx, dy);
      await page.waitForTimeout(150);
    }
  }
  await releaseAll();
}
