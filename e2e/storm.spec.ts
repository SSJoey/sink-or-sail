import { expect, test } from "@playwright/test";
import { join } from "./helpers.ts";

// The second test server's closing storm closes from 0:02 to 0:12 (playwright.config.ts), so a ship left at
// its start (650 from the middle) is outside the circle from about 0:06.
const BASE = "http://localhost:2578";

test("closing storm: Last Afloat with hazards on; a ship left at its start ends up in the storm and loses health", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = async () => (await browser.newContext({ baseURL: BASE })).newPage();
  const host = await page();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const other = await page();
  await join(other, "Other", code);
  await host.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await other.getByRole("button", { name: /Crew 2 · Pilot — free/ }).click();
  await host.getByRole("button", { name: "Last Afloat" }).click();
  await expect(host.locator("#hazards-toggle")).toBeChecked();
  await host.click("#start");

  const status = host.locator("#storm-status");
  // Under load the game view can take a while to appear (see the watch item in CLAUDE.md).
  await expect(status).toHaveText(/^Storm in 0:0[12]$|^Storm closing$/, { timeout: 15_000 });
  await expect(host.locator("#countdown")).toBeHidden({ timeout: 10_000 });
  await expect(status).toHaveText(/^Storm closing$|^In the storm!$/, { timeout: 15_000 });
  await expect(status).toHaveText("In the storm!", { timeout: 15_000 });
  await expect(status).toHaveClass(/in-storm/);
  await expect.poll(async () => Number(await host.locator("#game").getAttribute("data-own-health")), { timeout: 10_000 }).toBeLessThan(100);
});
