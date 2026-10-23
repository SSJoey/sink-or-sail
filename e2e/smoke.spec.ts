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

test("laptop: the gunner aims with the mouse and fires only while the left button is held", async ({ page }) => {
  await page.goto("/");
  await page.fill("#name", "Mouse");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await page.getByRole("button", { name: /Crew 1 · Gunner — free/ }).click();
  await page.click("#start");
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 6000 });

  const shots = async () => Number(await page.locator("#game").getAttribute("data-shots"));
  const box = (await page.locator("#game canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.1);
  await page.waitForTimeout(800);
  expect(await shots()).toBe(0);

  await page.mouse.down();
  await expect.poll(shots, { timeout: 3000 }).toBeGreaterThan(0);
  await page.mouse.up();
});

test("laptop: pause, host resumes with a countdown, host exits to the scoreboard", async ({ page }) => {
  await page.goto("/");
  await page.fill("#name", "Host");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await page.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await page.click("#start");
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 6000 });

  await page.click("#hud-pause");
  await expect(page.locator("#paused-text")).toHaveText("Paused by Host");
  await expect(page.locator("#resume")).toBeVisible();
  const clock = await page.locator("#hud-clock").textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator("#hud-clock")).toHaveText(clock!); // the timer is frozen

  await page.click("#resume");
  await expect(page.locator("#paused")).toBeHidden();
  await expect(page.locator("#countdown")).toHaveText(/^[123]$/);
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 6000 });

  page.once("dialog", (dialog) => void dialog.accept());
  await page.click("#hud-exit");
  await expect(page.locator("#scoreboard")).toBeVisible();
  await expect(page.locator("#result h2")).toHaveText("Draw!");
  await page.click("#back-to-room");
  await expect(page.locator("#last-result")).toBeVisible();
});
