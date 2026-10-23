import { expect, test } from "@playwright/test";

// A landscape phone: touch is the main pointer.
test.use({ viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true });

test("phone: touch controls show for the pilot and the stick sails the ship", async ({ page }) => {
  await page.goto("/");
  await page.fill("#name", "Thumb");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await page.getByRole("button", { name: /Crew 1 · Pilot — free/ }).click();
  await page.click("#start");
  await expect(page.locator("#game")).toHaveAttribute("data-ships", "2");

  await expect(page.locator("#btn-boost")).toBeVisible();
  await expect(page.locator("#btn-fire")).toBeHidden();
  await expect(page.locator("#stick-base")).toBeVisible();
  await expect(page.locator("#rotate")).toBeHidden();

  const ownX = async () => Number(await page.locator("#game").getAttribute("data-own-x"));
  const startX = await ownX();

  // Put a thumb down on the left half and push it to the right (east), using real touch events.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 150, y: 260 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 230, y: 260 }] });
  await expect.poll(ownX, { timeout: 5000 }).toBeGreaterThan(startX + 30);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
});
