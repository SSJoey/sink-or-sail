import { expect, test } from "@playwright/test";
import { join } from "./helpers.ts";

// Stage 3 slice 3: players who join while a match is on wait for the next round, setting up their crew meanwhile.
test("late joiners wait: they pair up and pick a role, can watch the match, and become a crew when it ends", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = async () => (await browser.newContext()).newPage();
  const host = await page();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  await host.click("#start");
  await expect(host.locator("#countdown")).toBeHidden({ timeout: 15_000 });

  const tom = await page();
  await join(tom, "Tom", code);
  await expect(tom.locator("#waiting")).toBeVisible();
  await expect(tom.locator("#game-screen")).toBeHidden();
  await expect(tom.locator("#w-afloat")).toHaveText("2");
  await expect(tom.locator("#w-clock-label")).toHaveText("time left");
  await expect(tom.locator("#w-partner")).toHaveText("Looking for a partner");

  const ana = await page();
  await join(ana, "Ana", code);
  await expect(tom.locator("#w-others")).toHaveText("1");
  await tom.getByRole("button", { name: "Pair with Ana" }).click();
  await expect(tom.locator("#w-partner")).toHaveText("Paired with Ana");
  await expect(ana.locator("#w-partner")).toHaveText("Paired with Tom");
  await tom.click("#w-role-gunner");
  await expect(tom.locator("#w-role-gunner")).toHaveAttribute("aria-pressed", "true");

  // Watch the match, then back to the waiting screen.
  await tom.click("#w-watch");
  await expect(tom.locator("#game-screen")).toBeVisible();
  await tom.click("#hud-back");
  await expect(tom.locator("#game-screen")).toBeHidden();
  await expect(tom.locator("#waiting")).toBeVisible();

  // The host ends the match: the pair becomes Crew 2, Tom as its gunner.
  host.on("dialog", (dialog) => void dialog.accept());
  await host.click("#hud-exit");
  await expect(tom.locator("#my-crew")).toHaveAttribute("data-crew", "1");
  await expect(tom.locator("#my-crew")).toHaveAttribute("data-role", "gunner");
  await expect(ana.locator("#my-crew")).toHaveAttribute("data-role", "pilot");
  await expect(tom.locator("#waiting")).toBeHidden();
});
