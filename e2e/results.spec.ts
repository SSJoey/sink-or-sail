import { expect, test } from "@playwright/test";
import { join, seatAs } from "./helpers.ts";

// Stage 3 slice 5: the results at the end of a match, Play again, and back to the lobby by themselves after 20 s.
test("results: everyone sees the table; the host plays again; the results close by themselves", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = async () => (await browser.newContext()).newPage();
  const host = await page();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const other = await page();
  await join(other, "Other", code);
  await seatAs(other, 2, "pilot");
  host.on("dialog", (dialog) => void dialog.accept());
  const endNow = async () => {
    await expect(host.locator("#countdown")).toBeHidden({ timeout: 15_000 });
    await host.click("#hud-exit");
  };

  await host.click("#start");
  // Boosting for 2.5 s spends about 75 energy: enough for Speed Demon (50), shown as an award (Stage 3 slice 7).
  await expect(host.locator("#hud-clock")).toHaveText(/^3:5\d$/, { timeout: 15_000 }); // the match is running
  await host.keyboard.down("Space");
  await host.waitForTimeout(2500);
  await host.keyboard.up("Space");
  await endNow();
  await expect(other.locator("#result .awards li")).toContainText(["Speed Demon · ● Crew 1 · energy on boost"]);
  for (const p of [host, other]) {
    await expect(p.locator("#scoreboard")).toBeVisible();
    await expect(p.locator("#result tr th")).toHaveText(["Place", "Crew", "Ship", "Sinkings", "Time afloat"]);
    await expect(p.locator("#result tr")).toHaveCount(3);
    await expect(p.locator("#results-countdown")).toHaveText(/^Back to the lobby in \d+$/);
  }
  await expect(host.locator("#play-again")).toBeVisible();
  await expect(other.locator("#play-again")).toBeHidden();
  await expect(other.locator("#results-wait")).toHaveText("Waiting for the host to play again");

  // Play again: a new match at once, with the same crews.
  await host.click("#play-again");
  await expect(other.locator("#scoreboard")).toBeHidden();
  await expect(other.locator("#game")).toHaveAttribute("data-ships", "2");

  // End it again and wait: everyone is back in the lobby after 20 s.
  await endNow();
  await expect(other.locator("#scoreboard")).toBeVisible();
  await expect(other.locator("#game-screen")).toBeHidden({ timeout: 25_000 });
  await expect(other.locator("#room-screen")).toBeVisible();
  await expect(other.locator("#my-crew")).toHaveAttribute("data-crew", "1");
});
