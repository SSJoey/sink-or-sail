# Notes

## Decisions

### 2026-10-23 — Slice 1: environment

- **Node.js 22** (v22.21.0 installed via nvm; maintenance LTS until April 2027). Docker image `node:22-slim`.
- **TypeScript 7.0.2.** If Phaser or Colyseus types break with it, ask before falling back to 6.0.3.
- **Docker runs with `sudo`** (the user isn't in the `docker` group; no system change).
- **Exact version pins** (no `^`/`~`): Phaser 4.2.1, @colyseus/core 0.18.23, @colyseus/schema 5.0.42, @colyseus/sdk 0.18.6, @colyseus/testing 0.18.6, Vite 8.3.5, Vitest 5.0.5.
- **Room tests use `@colyseus/testing` with Vitest.** The Colyseus docs say it works with Vitest.
- We use Colyseus 0.18 (current); `docs/design.md` mentions 0.17 "at time of writing".

### 2026-10-23 — Slice 2: project skeleton

- **npm workspaces**, packages `@sink-or-sail/shared`, `@sink-or-sail/server`, `@sink-or-sail/client`.
- **The skeleton starts an empty Colyseus server** (no rooms), so problems with Colyseus types under TypeScript 7 or with Docker show up early.
- **Only the Colyseus parts we need**: `@colyseus/core` 0.18.23, `@colyseus/ws-transport` 0.18.4, `@colyseus/tools` 0.18.10, instead of the all-in-one `colyseus` package. The all-in-one package brings in `@colyseus/auth`, whose dependencies have 15 low/moderate advisories (via `grant` → `elliptic`, `uuid`); the smaller set has 0.
- **One container, one port (2567).** Vite builds the client; the game server serves `client/dist` with **Express 5.3.0** (+ `@types/express` 5.0.6, dev only).
- **The server runs `.ts` directly with Node 22's built-in type stripping** — no build step. `erasableSyntaxOnly` is on, so the compiler blocks syntax Node can't strip (enums, parameter properties, namespaces).
- **`@types/node` 22.20.5** (dev) for Node type definitions.

### 2026-10-23 — Slice 3: rooms by code

- **Bare HTML join screen** in this slice (no Phaser), so joining can be tried from phones. The slice 2 Phaser scene is removed from `main.ts` until slice 6 draws the game.
- **Seats:** players join first with a name, then tap one of 4 seats (Crew 1/2 × pilot/gunner). Seatless players count toward the 4-player limit. Switching to a free seat is allowed for now; slice 8 locks seats at match start.
- **Room codes:** 4 letters from A–Z without I and O (24 letters), case-insensitive; spaces are ignored. Uniqueness uses the Colyseus "custom room ID" recipe (a presence set of codes in use; a code is freed when its room closes).
- **Names:** 1–12 characters after trimming (counted as characters, so emoji fit), unique in the room regardless of case. A dropped player's name stays reserved while their seat is held.
- **Reconnection:** a dropped player's seat is held for **60 s**. The SDK reconnects on its own after a drop; after a page reload, the client reconnects with a token kept in `sessionStorage`. Leaving on purpose frees the seat at once.
- **Room constants** (code alphabet and length, max players, name length, reconnection window) live in `shared/src/rooms.ts`; `shared/tuning.ts` is for gameplay numbers from slice 4.
- **Join errors:** Colyseus reports both "wrong code" and "room full" as matchmaker error 522; the client tells them apart by the message text ("not found" vs "is locked"). If a Colyseus upgrade changes these messages, the join screen falls back to a general error.
- `@colyseus/sdk` 0.18.6 is also a server dev dependency, because `@colyseus/testing` needs it.

### 2026-10-23 — Slice 4: simulation rules

- **Steering: point to steer.** The pilot's stick gives the wanted direction; the ship turns toward it at its turn rate; how far the stick is pushed sets speed. Velocity catches up with heading through a "grip" factor, which gives the slight drift. With the stick released, the ship slows to a stop.
- **Boost and shield are hold-to-use**, draining the shared bar per second. Energy refills only while neither is in use. After the bar runs empty, boost and shield need 20 energy before they work again.
- **Fire: hold for auto-fire**, one shot per 0.4 s. Firing costs no energy.
- **Fire and shield both held: shield wins** (no shots).
- **Turret: instant and world-fixed.** It points exactly where the gunner aims, in sea directions; turning the ship doesn't swing it; releasing the stick keeps the last aim.
- **Shots fly at a fixed speed** (450/s) in the aim direction and don't carry the ship's speed. A ship's own shots can't hit it. The island stops shots.
- **Shield** blocks all damage (shots and bumps).
- **Collisions:** ships are circles. Ships push each other apart; against the island or sea edge a ship slides with no damage.
- **Ship-vs-ship bumps deal damage** to both ships, scaled by closing speed: nothing below 60/s, up to 15 at a full-boost head-on hit. Damage happens once when contact starts, not every tick. If a bump sinks a ship, the other ship gets the sinking. Shield and respawn protection both block bump damage.
- **Respawn:** after 3 s, at whichever of 4 fixed spawn points is farthest from the enemy ship, with full health and energy.
- **Protection (2 s):** the ship can't be damaged and can act normally, but **firing ends protection early**.
- **Match end:** after 240 s, most sinkings wins; equal sinkings is a **draw**.
- **Events:** the simulation step returns a list of what happened (shot fired, hit, shield block, sunk, respawn, energy empty, boost used), for the slice 9 log and client effects.
- **Boost always drives the ship ahead** along its heading at ×1.8 top speed, however far the stick is pushed (even released). Boost never wastes energy, and the pilot can boost with one thumb while steering with the other.
- **Map layout** (island outline, 2 start points, 4 respawn points) lives in `shared/src/sim/map.ts`; the sea size is in `tuning.ts`. Ships start left and right of the island, facing the middle.
- Added events not in the original list, because the slice 9 log summary needs them: `energyRestored` (for time with an empty bar), `protectionEnded` and `bump`.
- **Starting values approved** (in `shared/src/tuning.ts`): sea 1600 × 900; ship radius 28, top speed 150/s, turn 180°/s, grip 3/s; boost ×1.8 at 30 energy/s; shield 40 energy/s; energy max 100, refill 15/s, restart at 20; shots every 0.4 s, 450/s, range 600, 20 damage; health 100; bump damage up to 15 above 60/s closing speed; respawn 3 s; protection 2 s; match 240 s.

### 2026-10-23 — Slice 5: server loop

- **Fixed tick with `setFixedTimestep`** at 20 Hz (`TUNING.server.tickRate`). It hands the simulation a fixed `dt`, never a measured one. The synced state is patched to clients every tick.
- **Temporary start button:** any seated player can start the simulation when no match is running, with any number of seats filled. Slice 8 replaces this with the real match flow.
- **Input as plain room messages**, validated by our own code: pilots send `{ steer, boost }`, gunners `{ aim, fire, shield }`. Colyseus 0.18's `defineInput` was not used (built for client prediction; more than Stage 0 needs).
- **Stale input:** the latest input stays in force until the next message. When a player drops, their role goes neutral.
- **Rejected input:** unknown message types, malformed input, the other role's fields and input from seatless players are all ignored.
- **Rate limit:** 60 messages per second per client (Colyseus `maxMessagesPerSecond`); a client over the limit is disconnected and can reconnect.
- Crew 1 sails ship 0; Crew 2 sails ship 1.
- Server test files run one at a time (`fileParallelism: false` for the server Vitest project), because each boots a Colyseus test server on the same port.

### 2026-10-23 — Slice 6: rendering and laptop controls

- **Browser smoke test: Playwright** (`@playwright/test` 1.64.1, dev dependency) using the installed **Google Chrome** (channel `chrome`), so there is no browser download. `npm test` runs Vitest and then the smoke test; `npm run test:unit` runs Vitest alone.
- **Crew colours:** Crew 1 orange `#F5A623` with a ● circle flag; Crew 2 pink-magenta `#E8559A` with a ■ square flag.
- **Client rates** (in `tuning.ts`): input sent at 20 Hz; drawing runs 100 ms behind the server, blending between snapshots.
- **View:** the whole 1600 × 900 sea is scaled to fit the window, with bars if needed, so every device sees the same sea.
- **Seatless players** see the game without controls or aiming guide; the top bar says "Watching".
- **Match over** (until slice 8): the game view closes and the room screen shows "Match over" with the Start button.
- **Aiming guide** (own ship only, both crewmates): a dashed line from the turret to the 600 shot range, a faint 10°-wide cone along it, and a crosshair at the end of the range.
- Sunk ships aren't drawn yet (slice 8 shows sinking and respawn). Shield = a ring around the ship; protection = a see-through ship; boost = a short wake.

### 2026-10-23 — Slice 7: phone controls

- **Fire and Shield: first pressed wins.** While one is held, touching the other does nothing until the first is released.
- **Touch controls appear** from the start on devices whose main pointer is a finger (CSS `pointer: coarse`), and on any device as soon as the screen is touched. Keyboard and mouse keep working alongside.
- **Stick:** 60 CSS px of travel and a 10% dead zone (in `tuning.ts`); output rises smoothly from 0 at the dead-zone edge to 1 at full travel. Resting spot bottom-left; jumps to wherever the thumb lands on the left half. The gunner's stick aims; releasing keeps the last aim.
- **Buttons:** Boost 120 px circle; Fire 110 px with Shield 80 px beside it, bottom-right.
- **Phone smoke test:** a second Playwright test emulates a landscape touch phone, joins as pilot, drags the stick and checks the ship moves.
- **Top bar** now also shows score (both crews' sinkings) and the timer, on phones and laptops.
- The viewport meta blocks zoom page-wide (`maximum-scale=1, user-scalable=no`), which also covers the room screen; the other gesture blocks apply only to the game screen.
- The touch layer covers the whole game area, so touches never reach the canvas (where Phaser would read them as mouse clicks).
- **Android fullscreen + landscape lock** are requested on the first tap on the game screen (browsers allow them only after a user gesture). **Portrait** on a touch device shows a "Rotate your phone" screen over the game.

### 2026-10-23 — Slice 8: match flow

- **Only the host starts a match.** The host is the room's creator and doesn't need a seat to start. When the host leaves (not just drops: a dropped host stays host during the 60 s window), hosting passes to the longest-present player. The room screen marks the host with ★; only the host sees Start, others see "Waiting for the host to start".
- **3-2-1-Go countdown** (3 s, in `tuning.ts`) after Start: ships are visible but frozen and input is ignored.
- **Seats during a match:** seated players can't switch; a free seat (someone left) can be taken by a seatless player.
- **Scoreboard** appears over the frozen sea at time-up (winner or draw, each crew's sinkings and player names) with a "Back to room" button; the room screen keeps showing the last result next to Start. A new match resets scores.
- **Not yet approved:** I added `sinkFadeMs: 1000` (a sunk ship fades out over 1 s) to `tuning.ts`; it wasn't in the approved list. Waiting for confirmation or a different value.
- The browser smoke tests check the host's Start and the countdown but don't reach the scoreboard (that needs the full 4 minutes); room tests cover the end of the match. A test-only way to shorten the match was not added (would need approval).
- **On screen:** the sunk ship fades out; both crewmates get a "Sunk by …" banner and a "Back in 3… 2… 1" countdown; a respawned ship blinks while protected; **hit flash** when a ship is hit; **phone vibration** for both crewmates when their ship sinks (Android only).

### 2026-10-24 — Fix: gunner on a phone fired while aiming

- Phaser's own touch input listens on the whole window, so a thumb on the aiming stick also counted as a held mouse button and fired the gun (and moved the mouse aim). Phaser's touch input is now off (`input: { touch: false }`; our touch layer handles all touch), and the scene reads only the mouse pointer. Regression tests: a phone smoke test (aiming alone fires nothing; Fire fires) and a laptop one (the mouse fires only while held).

### 2026-10-24 — Tuning after the first game

- **Energy refill slowed by 30%:** `energy.refillPerSecond` 15 → 10.5 (empty to full now takes 9.5 s instead of 6.7 s). It's the shared bar, so boost and shield are both affected.

## Later
- Check ship size on phones: with the whole 1600 × 900 sea on screen, a hull is about 45 px long on a 1280 px laptop window and roughly 25–30 px on a landscape phone. If it's too small, consider a larger ship radius or a smaller sea (tuning, ask first).
