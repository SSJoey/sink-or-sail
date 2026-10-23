import { expect, test } from "@playwright/test";

test("loads, joins a room and shows a ship", async ({ page }) => {
  await page.goto("/");
  await page.fill("#name", "Smoke");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);

  await page.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await expect(page.getByRole("button", { name: /Crew 1 · Pilot — Smoke/ })).toBeVisible();

  await expect(page.locator("#start")).toBeVisible(); // the creator is the host
  await page.click("#start");
  await expect(page.locator("#countdown")).toHaveText(/^[123]$/);
  await expect(page.locator("#game canvas")).toBeVisible();
  // The scene reports how many ships it drew (a canvas has no elements to inspect).
  await expect(page.locator("#game")).toHaveAttribute("data-ships", "2");
  await expect(page.locator("#hud-role")).toHaveText("Pilot");
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 6000 }); // 3-2-1, then "Go!" for a second
});
