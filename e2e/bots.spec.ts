import { expect, test } from "@playwright/test";
import { join, sailWithKeys, seatAs } from "./helpers.ts";

// Stage 3 slice 9: a solo laptop pilot plays with a bot gunner, which fires at the other ship. Crew 2's ship waits
// at its start (1450, 450); Crew 1's pilot sails to within the bot's firing range (550) of it.
const NEAR_CREW_2 = { x: 1000, y: 200 };

test("partner bots: a solo pilot plays with a bot gunner, which fires at the other ship", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = async () => (await browser.newContext()).newPage();
  const host = await page();
  await join(host, "Ana");
  const code = (await host.textContent("#code"))!;
  const ben = await page();
  await join(ben, "Ben", code);
  await seatAs(ben, 2, "pilot");

  // Ana is alone in Crew 1: Play with a bot. The bot takes the gunner's seat and is ready.
  await expect(host.locator("#play-bot")).toBeVisible();
  await host.click("#play-bot");
  await expect(host.locator("#role-gunner-who")).toHaveText("Bot");
  await expect(host.locator('#crew-list li[data-crew="0"]')).toContainText("Ana ★ (you) & Bot");
  await expect(ben.locator('#crew-list li[data-crew="0"]')).toContainText("Ana ★ & Bot");
  await expect(host.locator("#play-bot")).toBeHidden();
  await expect(host.locator("#remove-bot")).toBeVisible();
  await host.uncheck("#packs-toggle"); // no health pack to top Crew 2's bar up again
  await host.click("#start");

  await expect(ben.locator("#game")).toHaveAttribute("data-lifebars", "0:1.00:green;1:1.00:green", { timeout: 15_000 });
  await expect(host.locator("#countdown")).toBeHidden({ timeout: 10_000 });
  const crew2Hit = async () => !/;1:1\.00:/.test((await ben.locator("#game").getAttribute("data-lifebars")) ?? "");
  await sailWithKeys(host, NEAR_CREW_2, crew2Hit);
  await expect.poll(crew2Hit, { timeout: 15_000 }).toBe(true);
});
