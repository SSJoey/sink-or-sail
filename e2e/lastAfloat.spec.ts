import { expect, test } from "@playwright/test";
import { join, ownPosition, sailWithKeys, seatAs } from "./helpers.ts";

test("Last Afloat: the host picks it with 1 life; sinking the other ship ends the match with a winner", async ({ browser }) => {
  test.setTimeout(120_000);
  const laptop = async () => (await browser.newContext()).newPage();
  const host = await laptop();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const enemy = await laptop();
  await join(enemy, "Enemy", code);

  // The host sets up the next match: packs off (nothing in the way), Last Afloat, 1 life.
  // The enemy was paired into the host's crew on joining: Crew 1 is the only crew so far.
  await seatAs(enemy, 1, "gunner");
  await host.uncheck("#packs-toggle");
  await host.getByRole("button", { name: "Last Afloat" }).click();
  await expect(host.getByRole("button", { name: "Last Afloat" })).toHaveAttribute("aria-pressed", "true");
  await host.selectOption("#lives-select", "1");
  await expect(enemy.locator("#mode-status")).toHaveText("Mode: Last Afloat · Lives: 1");

  // Crew 2 has nobody yet (2 ships, one empty): Last Afloat won't start.
  await host.click("#start");
  await expect(host.locator("#error")).toHaveText("Every crew needs a player for Last Afloat.");

  // The enemy starts Crew 2 and takes its pilot seat; the host switches to Crew 1's gunner.
  await seatAs(enemy, 2, "pilot");
  await seatAs(host, 1, "gunner");
  await expect(host.locator('#crew-list li[data-crew="1"]')).toContainText("Enemy");
  await host.click("#start");
  await expect(host.locator("#countdown")).toBeHidden({ timeout: 10_000 });
  await expect(host.locator("#hud-score")).toHaveText("● ♥ – ■ ♥");
  await expect(host.locator("#hud-clock")).toHaveText(/^(7:00|6:5\d)$/);

  // The enemy sails round the top of the island to within range of Crew 1's ship, which sits at its start.
  await sailWithKeys(enemy, { x: 800, y: 150 }, async () => (await ownPosition(enemy)).x < 900);
  await sailWithKeys(enemy, { x: 500, y: 250 });

  // Crew 1's gunner keeps the mouse on the enemy and holds fire until the match ends.
  const box = (await host.locator("#game canvas").boundingBox())!;
  const aimAtEnemy = async () => {
    const at = await ownPosition(enemy);
    await host.mouse.move(box.x + (at.x / 1600) * box.width, box.y + (at.y / 900) * box.height);
  };
  await aimAtEnemy();
  await host.mouse.down();
  await expect.poll(async () => {
    if (await host.locator("#scoreboard").isVisible()) return true;
    await aimAtEnemy();
    return false;
  }, { timeout: 30_000 }).toBe(true);
  await host.mouse.up();

  await expect(host.locator("#result h2")).toHaveText("● Crew 1 wins!");
  // The results table (Stage 3): place, crew, ship (Stage 5), sinkings, time afloat, lives left.
  const rows = host.locator("#result tr");
  await expect(rows.nth(1).locator("td")).toHaveText(["1st", "● Crew 1 · Host", "Frigate", "1", /^\d:\d\d$/, "1"]);
  await expect(rows.nth(2).locator("td")).toHaveText(["2nd", "■ Crew 2 · Enemy", "Frigate", "0", /^\d:\d\d$/, "out"]);
  await expect(enemy.locator("#result h2")).toHaveText("● Crew 1 wins!");
});
