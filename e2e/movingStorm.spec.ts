import { expect, test } from "@playwright/test";
import { join } from "./helpers.ts";

// The third test server's first dynamic hazard comes at 0:02 (playwright.config.ts). With seed 6 it is a moving
// storm signalled 250 from Crew 2's start; it forms at 0:05, swallows Crew 2's waiting ship from about 0:08 and
// leaves the sea at about 0:19.
const BASE = "http://localhost:2579";

test("moving storm: signalled, then forms and moves; the ship inside is hidden from the other crew, not its own", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = async () => (await browser.newContext({ baseURL: BASE })).newPage();
  const host = await page();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const other = await page();
  await join(other, "Other", code);
  await host.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await other.getByRole("button", { name: /Crew 2 · Pilot — free/ }).click();
  await expect(host.locator("#hazards-toggle")).toBeChecked();
  await host.click("#start");

  const game = host.locator("#game");
  // Under load the game view can take a while to appear (see the watch item in CLAUDE.md).
  await expect(game).toHaveAttribute("data-hazards", /^0:movingStorm:(signalled|active):/, { timeout: 15_000 });
  await expect(game).toHaveAttribute("data-hazards", /^0:movingStorm:active:/, { timeout: 15_000 });
  const x = async () => Number((await game.getAttribute("data-hazards"))!.split(":")[3]!.split(",")[0]);
  const first = await x();
  await expect.poll(x, { timeout: 5_000 }).not.toBe(first);

  // Crew 2's ship is under the cloud: hidden from Crew 1, still drawn for Crew 2.
  await expect(game).toHaveAttribute("data-hidden", "1", { timeout: 15_000 });
  await expect(other.locator("#game")).toHaveAttribute("data-hidden", "");
});
