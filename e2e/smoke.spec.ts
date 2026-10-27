import { expect, test } from "@playwright/test";
import { GAME_PAGE, join, seatAs } from "./helpers.ts";

test("loads, joins a room and shows a ship", async ({ page }) => {
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Smoke");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);

  // The creator starts Crew 1 as its pilot (Stage 3: everyone is in a crew).
  await seatAs(page, 1, "pilot");
  await expect(page.locator("#my-crew-title")).toHaveText("Your crew: ● Crew 1");

  await expect(page.locator("#start")).toBeVisible(); // the creator is the host
  await page.click("#start");
  await expect(page.locator("#countdown")).toHaveText(/^[123]$/);
  await expect(page.locator("#game canvas")).toBeVisible();
  // The scene reports how many ships it drew (a canvas has no elements to inspect).
  await expect(page.locator("#game")).toHaveAttribute("data-ships", "2");
  await expect(page.locator("#hud-role")).toHaveText("Pilot");
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 }); // 3-2-1, then "Go!" for a second
});

test("crews: switch role, get paired on joining, leave the crew, find a partner again; Ready shows to the host", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  await join(a, "Ana");
  const code = (await a.textContent("#code"))!;
  await expect(a.locator("#find-partner")).toBeVisible(); // alone in Crew 1
  await expect(a.locator("#leave-crew")).toBeHidden();
  await seatAs(a, 1, "gunner"); // the free role in your own crew
  await expect(a.locator("#role-pilot-who")).toHaveText("Waiting for a partner");

  // Ben joins and is paired into Ana's crew, in its free role.
  const b = await (await browser.newContext()).newPage();
  await join(b, "Ben", code);
  await expect(b.locator("#my-crew")).toHaveAttribute("data-crew", "0");
  await expect(b.locator("#my-crew")).toHaveAttribute("data-role", "pilot");
  await expect(a.locator("#role-pilot-who")).toHaveText("Ben");

  // Ben leaves for a crew of his own (Crew 2), then finds his partner again.
  await b.click("#leave-crew");
  await expect(b.locator("#my-crew")).toHaveAttribute("data-crew", "1");
  await expect(a.locator('#crew-list li[data-crew="1"]')).toContainText("Needs a gunner");
  await b.click("#find-partner");
  await expect(b.locator("#my-crew")).toHaveAttribute("data-crew", "0");
  await expect(a.locator("#crew-list li")).toHaveCount(1);

  // Ready: each player's own; the host sees the count.
  await expect(a.locator("#ready-count")).toHaveText("0 of 1 crews ready");
  await a.click("#ready");
  await b.click("#ready");
  await expect(a.locator("#ready-count")).toHaveText("1 of 1 crews ready");
  await expect(a.locator('#crew-list li[data-crew="0"]')).toContainText("Ready");
});

test("laptop: the gunner aims with the mouse and fires only while the left button is held", async ({ page }) => {
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Mouse");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await seatAs(page, 1, "gunner");
  await page.click("#start");
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 });

  const shots = async () => Number(await page.locator("#game").getAttribute("data-shots"));
  const box = (await page.locator("#game canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.1);
  await page.waitForTimeout(800);
  expect(await shots()).toBe(0);

  await page.mouse.down();
  // Generous: on a busy machine (many test pages at once) the first shot can take a few seconds to show.
  await expect.poll(shots, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.mouse.up();
});

test("laptop: pause, host resumes with a countdown, host exits to the scoreboard", async ({ page }) => {
  await page.goto(GAME_PAGE);
  await page.fill("#name", "Host");
  await page.click("#create");
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await seatAs(page, 1, "pilot");
  await page.click("#start");
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 });

  await page.click("#hud-pause");
  await expect(page.locator("#paused-text")).toHaveText("Paused by Host");
  await expect(page.locator("#resume")).toBeVisible();
  const clock = await page.locator("#hud-clock").textContent();
  await page.waitForTimeout(1200);
  await expect(page.locator("#hud-clock")).toHaveText(clock!); // the timer is frozen

  await page.click("#resume");
  await expect(page.locator("#paused")).toBeHidden();
  await expect(page.locator("#countdown")).toHaveText(/^[123]$/);
  await expect(page.locator("#countdown")).toBeHidden({ timeout: 10_000 });

  page.once("dialog", (dialog) => void dialog.accept());
  await page.click("#hud-exit");
  await expect(page.locator("#scoreboard")).toBeVisible();
  await expect(page.locator("#result h2")).toHaveText("Draw!");
  await page.click("#back-to-room");
  await expect(page.locator("#last-result")).toBeVisible();
});

test("a page left open across a rebuild reloads itself and rejoins its seat", async ({ page }) => {
  // The first version check sees a "newer build" (a different script name); later ones see the real page.
  let faked = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!faked && request.resourceType() === "fetch" && new URL(request.url()).pathname === "/") {
      faked = true;
      const real = await (await route.fetch()).text();
      await route.fulfill({ contentType: "text/html", body: real.replace(/src="\/assets\/[^"]+\.js"/, 'src="/assets/index-NEWER.js"') });
      return;
    }
    await route.continue();
  });

  await page.goto(GAME_PAGE);
  await page.fill("#name", "Stale");
  const reloaded = page.waitForEvent("load");
  await page.click("#create");
  await reloaded;
  expect(faked).toBe(true);

  // Back in the same room after the reload, via the saved reconnection token.
  await expect(page.locator("#code")).toHaveText(/^[A-Z]{4}$/);
  await expect(page.locator("#room-screen")).toBeVisible();
  await expect(page.locator("#my-crew")).toHaveAttribute("data-crew", "0");
  await expect(page.locator("#crew-list")).toContainText("Stale");
});
