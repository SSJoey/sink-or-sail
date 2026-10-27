import { expect, test } from "@playwright/test";
import { GAME_PAGE, join } from "./helpers.ts";

// Stage 3 slice 1: the QR code's join link, changing your name, and the name remembered on the device.
// The main test server's JOIN_ADDRESS is 192.0.2.10 (playwright.config.ts), and these pages are on localhost.

test("the room screen shows a QR code holding the laptop's address and the room code", async ({ page }) => {
  await join(page, "Qr");
  const code = (await page.textContent("#code"))!;
  await expect(page.locator("#qr svg")).toBeVisible();
  await expect(page.locator("#qr")).toHaveAttribute("data-link", `http://192.0.2.10:2577/?code=${code}`);
  await expect(page.locator("#qr-caption")).toHaveText("Scan to join");
});

test("opening a join link fills in the room code; the player only types a name", async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  await join(host, "Host");
  const code = (await host.textContent("#code"))!;
  const phone = await (await browser.newContext()).newPage();
  await phone.goto(`${GAME_PAGE}&code=${code.toLowerCase()}`);
  await expect(phone.locator("#code-input")).toHaveValue(code);
  await phone.fill("#name", "Guest");
  await phone.click("#join");
  await expect(phone.locator("#code")).toHaveText(code);
});

test("a player changes their name between matches; a taken name is refused; the device remembers it", async ({ browser }) => {
  const context = await browser.newContext();
  const a = await context.newPage();
  await join(a, "Ana");
  const code = (await a.textContent("#code"))!;
  const b = await (await browser.newContext()).newPage();
  await join(b, "Ben", code);

  await b.click("#name-change");
  await b.fill("#name-new", "ana");
  await b.click("#name-save");
  await expect(b.locator("#error")).toHaveText("That name is already in this room.");
  await expect(b.locator("#my-name")).toHaveText("Ben");

  await b.click("#name-change");
  await b.fill("#name-new", "Robin");
  await b.click("#name-save");
  await expect(b.locator("#my-name")).toHaveText("Robin");
  await expect(a.locator("#crew-list")).toContainText("Robin");

  // The next visit on Ana's device starts with her name filled in.
  const again = await context.newPage();
  await again.goto(GAME_PAGE);
  await expect(again.locator("#name")).toHaveValue("Ana");
});
