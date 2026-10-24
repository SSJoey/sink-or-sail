import { expect, test, type Page } from "@playwright/test";

// With MATCH_SEED=13 (playwright.config.ts) the first pack is a torpedo at (450, 600): signalled 8 s into
// the match, on the water at 11 s. These tests sail Crew 1's ship onto it.
const TORPEDO = { x: 450, y: 600 };

async function startAsPilot(page: Page) {
  await page.goto("/");
  await page.fill("#name", "Packer");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await expect(page.locator("#packs-toggle")).toBeChecked(); // packs are on by default
  await page.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await page.click("#start");
  await expect(page.locator("#hud-pack")).toHaveText("Pack: —");
  // Wait for the torpedo to appear on the water.
  await expect(page.locator("#game")).toHaveAttribute("data-packs", /torpedo@450,600/, { timeout: 20_000 });
}

async function ownPosition(page: Page) {
  const x = Number(await page.locator("#game").getAttribute("data-own-x"));
  const y = Number(await page.locator("#game").getAttribute("data-own-y"));
  return { x, y };
}

test("laptop: sail onto a pack with WASD; it fills the slot", async ({ page }) => {
  test.setTimeout(60_000);
  await startAsPilot(page);

  const held = new Set<string>();
  const hold = async (key: string, down: boolean) => {
    if (down && !held.has(key)) { await page.keyboard.down(key); held.add(key); }
    if (!down && held.has(key)) { await page.keyboard.up(key); held.delete(key); }
  };
  for (let i = 0; i < 80 && (await page.locator("#hud-pack").textContent()) === "Pack: —"; i++) {
    const own = await ownPosition(page);
    const dx = TORPEDO.x - own.x;
    const dy = TORPEDO.y - own.y;
    await hold("d", dx > 10);
    await hold("a", dx < -10);
    await hold("s", dy > 10);
    await hold("w", dy < -10);
    await page.waitForTimeout(150);
  }
  for (const key of [...held]) await page.keyboard.up(key);

  await expect(page.locator("#hud-pack")).toHaveText("Pack: Torpedo");
  await expect(page.locator("#game")).not.toHaveAttribute("data-packs", /torpedo@450,600/);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true });

  test("sail onto a pack with the touch stick; slot and Pack button show it, dim", async ({ page }) => {
    test.setTimeout(60_000);
    await startAsPilot(page);
    await expect(page.locator("#btn-pack")).toBeVisible();
    await expect(page.locator("#btn-pack")).toHaveText("Pack");

    const cdp = await page.context().newCDPSession(page);
    const base = { x: 150, y: 260 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...base, id: 1 }] });
    for (let i = 0; i < 80 && (await page.locator("#hud-pack").textContent()) === "Pack: —"; i++) {
      const own = await ownPosition(page);
      const dx = TORPEDO.x - own.x;
      const dy = TORPEDO.y - own.y;
      const length = Math.hypot(dx, dy) || 1;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: base.x + (dx / length) * 60, y: base.y + (dy / length) * 60, id: 1 }],
      });
      await page.waitForTimeout(150);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(page.locator("#hud-pack")).toHaveText("Pack: Torpedo");
    await expect(page.locator("#btn-pack")).toHaveText("Torpedo");
    // A torpedo is the gunner's pack (and nothing is usable until Stage 1 slices 2–4): dim for the pilot.
    await expect(page.locator("#btn-pack")).not.toHaveClass(/lit/);
  });
});
