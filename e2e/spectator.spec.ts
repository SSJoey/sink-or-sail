import { expect, test } from "@playwright/test";
import { GAME_PAGE, join } from "./helpers.ts";

// Stage 3 slice 8: watching a match (a TV or laptop), a host who only hosts, and Play next round.
test("spectators: a TV watches with no controls; a host who only watches still runs the match; Play next round", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = async () => (await browser.newContext()).newPage();
  const host = await page();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const ben = await page();
  await join(ben, "Ben", code);

  // The TV joins to watch: the big-screen lobby, no crew.
  const tv = await page();
  await tv.goto(GAME_PAGE);
  await tv.fill("#name", "TV");
  await tv.fill("#code-input", code);
  await tv.click("#watch");
  await expect(tv.locator("#spectating")).toBeVisible();
  await expect(tv.locator("#play-next")).toBeVisible();
  await expect(tv.locator("#my-crew")).toBeHidden();
  await expect(host.locator("#crew-list li")).toHaveCount(1);

  // The host switches to watching: Ben is now Crew 1 on his own; the host keeps Start.
  await host.click("#watch-instead");
  await expect(host.locator("#spectating")).toBeVisible();
  await expect(ben.locator("#my-crew")).toHaveAttribute("data-crew", "0");
  await expect(ben.locator("#role-gunner-who")).toHaveText("Ben (you)");
  await host.click("#start");

  // During the match the TV sees the sea, with no controls; the spectator host can pause.
  await expect(tv.locator("#game-screen")).toBeVisible({ timeout: 15_000 });
  await expect(tv.locator("#hud-role")).toHaveText("Watching · Sink Count");
  await expect(tv.locator("#hud-play-next")).toBeVisible();
  await expect(tv.locator("#hud-pause")).toBeHidden();
  await expect(host.locator("#hud-clock")).toHaveText(/^3:5\d$/, { timeout: 15_000 });
  await expect(host.locator("#hud-pause")).toBeVisible();
  await host.click("#hud-pause");
  await expect(tv.locator("#paused")).toBeVisible();

  // The TV asks to play the next round: it waits for it.
  await tv.click("#hud-play-next");
  await expect(tv.locator("#waiting")).toBeVisible();
  await expect(tv.locator("#game-screen")).toBeHidden();
});
