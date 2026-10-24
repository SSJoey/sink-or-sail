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
- `sinkFadeMs: 1000` (a sunk ship fades out over 1 s) was added without approval in slice 8; **approved 2026-10-24**.
- The browser smoke tests check the host's Start and the countdown but don't reach the scoreboard (that needs the full 4 minutes); room tests cover the end of the match. A test-only way to shorten the match was not added (would need approval).
- **On screen:** the sunk ship fades out; both crewmates get a "Sunk by …" banner and a "Back in 3… 2… 1" countdown; a respawned ship blinks while protected; **hit flash** when a ship is hit; **phone vibration** for both crewmates when their ship sinks (Android only).

### 2026-10-24 — Fix: gunner on a phone fired while aiming

- Phaser's own touch input listens on the whole window, so a thumb on the aiming stick also counted as a held mouse button and fired the gun (and moved the mouse aim). Phaser's touch input is now off (`input: { touch: false }`; our touch layer handles all touch), and the scene reads only the mouse pointer. Regression tests: a phone smoke test (aiming alone fires nothing; Fire fires) and a laptop one (the mouse fires only while held).

### 2026-10-24 — Tuning after the first game

- **Energy refill slowed by 30%:** `energy.refillPerSecond` 15 → 10.5 (empty to full now takes 9.5 s instead of 6.7 s). It's the shared bar, so boost and shield are both affected.

### 2026-10-24 — Plan change: Pause and Exit game (added after the first game, before slice 9)

- **Pause:** any seated player can pause during the countdown or a match; everything freezes (timer, ships, shots, respawn and protection timers), input is ignored, and screens show "Paused by <name>". Seats stay locked while paused.
- **Resume:** host only, with the same 3-2-1 countdown; the match carries on where it stopped.
- **Exit game:** host only (top bar and pause box), after a confirmation ("End the match now?"). It ends the match now with the current score as the result, and everyone gets the scoreboard, as at time-up.
- The browser smoke tests now reach the scoreboard through Exit game, so the earlier gap (no test-only way to shorten the match) is closed without one.

### 2026-10-24 — Slice 9: match event log

- **One JSON Lines file per match** in `logs/`, named by local date, time and room code (e.g. `2026-10-24_18-30-05_KWPZ.jsonl`). It opens at match start and closes at match end. Every line has `t` (match time in ms; pauses don't count) and `type`; where relevant `ship`, and `player` + `role` for whoever acted. Ship-level events list both crew members.
- **Events logged:** the CLAUDE.md list plus what was added since (bump, pause, resume, ended early, seat taken, energy restored). A `position` line per ship once a second.
- **Energy spent on boost vs shield** is counted in the simulation (per-ship counters, pure and tested) and written in the position lines and at match end.
- **Average survival time** includes the last life: a ship afloat at match end counts its last life up to the end.
- **Accuracy** = hits that did damage ÷ shots fired; shots blocked by a shield count as misses and are shown in their own column.
- **Time zone:** `compose.yaml` sets `TZ: Asia/Kolkata` (the laptop's zone), so file names use local time. (Slice 10 found that mounting `/etc/localtime` didn't work: Node needs the zone by name, and the slim image can't work it out, so it fell back to UTC.) Change `TZ` if the laptop moves to another time zone.
- Writes are buffered and flushed asynchronously about once a second and at match end; a write error is reported on the console and never stops the match.
- Log lines use ship ids from 0 (ship 0 = Crew 1); the summary table says "Crew 1 / Crew 2" as players see it.
- Extra line types beyond the list: `playerDropped`, `protectionEnded`, and `roomClosed` (everyone left mid-match; the log then has no `matchEnd`, and the summary says the log ends before the match did).
- Tests (Vitest room tests and Playwright smoke tests) write their match logs to a temporary folder via the `LOG_DIR` environment variable, never to the real `logs/`.
- Summary: `npm run summary -- logs/<file>.jsonl [more files]`.

### 2026-10-24 — Slice 10: home network play

- **Ship size stays** (radius 28 on the 1600 × 900 sea): fine on the phones in the first game.
- **Playtest guide** goes in `docs/playtest.md`.
- Network: the laptop is on 192.168.1.11. `ufw` is active, but Docker publishes port 2567 around it; Cloudflare WARP excludes local network addresses, so phones can reach the laptop.
- Fix only what blocks a full match; everything else goes under "Later" or into a tuning list.
- Docker is Canonical's snap package; its service (`snap.docker.dockerd`) starts at boot, so with `restart: unless-stopped` the game comes back after a laptop restart.
- Docker commands must run in a normal terminal: the Claude prompt's `!` has no terminal, so `sudo` can't ask for the password. The first slice 10 rebuild silently didn't happen because of this.
- **Phones on an old page:** after a rebuild, phones that kept the page open ran the old code while reconnecting to the new server (auto-fire bug and no Pause button again). Fix: on joining or reconnecting, the page fetches the server's current page and reloads itself if the main script's hashed name differs; the reload rejoins the seat via the saved token. Tested by unit tests and a smoke test that fakes a newer build.
- **Energy refill slowed again:** `energy.refillPerSecond` 10.5 → 7.5 (empty to full in 13.3 s).
- Summary fix: the match length rounded the seconds separately and could show "2:60"; it now rounds the whole time first (179.5 s → 3:00).
- **Still to verify in the combined testing session (2026-10-24):**
  1. Time zone: after `TZ: Asia/Kolkata` and a recreate, log names were still UTC. Run `sudo docker compose exec server printenv TZ` and `... date` to see whether the setting reaches the container.
  2. Reload every phone by hand once (pages open before this build lack the self-reload check).
  3. A full 4-player match (both crews) run to time-up; check the log ends with `matchEnd` at 240000 ms and the summary shows both crews.

### 2026-10-24 — Stage 1 slice 1: pack basics

- **Seeded generator:** a small in-house one (mulberry32) in `shared/src/sim/random.ts`, no dependency. The server picks a new seed at each match start and writes it to the log, so a match can be replayed exactly.
- **All four pack types spawn from slice 1**, 25% each. Mine, torpedo and EMP can be picked up and held (shown in the slot, Pack button dim) but only become usable in slices 2–4.
- **Spawn clock (refines CLAUDE.md's starting values):** packs come one at a time, at most 2 on the map, and glowing spots count toward the 2. The first spot is signalled 8 s into the match (pack appears at 0:11); each next signal comes 8 s after the last pack appeared. When the map is full the clock waits; after a pickup from a full map, the next signal comes 8 s after that pickup.
- **Pickup:** when the ship's circle (radius 28) touches the pack's (radius 18), so centres within 46. Any ship afloat can pick up, including during respawn protection.
- **Spawn spots (6, mirror-symmetric):** (800, 150), (800, 750), (450, 300), (450, 600), (1150, 300), (1150, 600). A test checks each is well clear of the island and the respawn and start spots.
- **Pack looks:** M circle, T capsule, E diamond, H square; white outline and letter on a dark fill, about 36 px across. Signalled spots show a pulsing white ring.
- **Packs on/off toggle:** the host sees a "Packs on" checkbox next to Start; everyone else sees "Packs: on/off". Changes apply from the next match (disabled during a match). Default on.
- **Pack button in input:** an optional `pack` field in both roles' input messages, so Stage 0 messages (and tests) stay valid.
- **Stage 0 reference match:** before any pack code, a scripted 90-second two-ship fight (48 hits, 9 sinkings and respawns, shield blocks, a bump, empty bars) was recorded from the Stage 0 simulation (`shared/src/sim/fixtures/stage0-run.json`). A test replays it with packs off and requires every event and the final world to match exactly.
- Within a step the spawn clock runs before pickups, so a clock restarted by a pickup counts its 8 s from the next step (same as after a pack appears).
- Pickup order when two ships touch the same pack: lowest ship id first.
- Pack events use the field `packType` for the pack's type (`type` is the event name).
- **`MATCH_SEED` environment variable (added without asking first; easy to remove):** fixes every match's seed. The browser smoke tests use it (seed 13: the first pack is a torpedo at (450, 600)) so pack tests don't depend on chance; it also lets a logged match's pack spawns be replayed.
- The Pack button sends `pack: true` only when lit; in this slice nothing is usable yet (`USABLE_PACKS` is empty), so it is always dim.
- Watch on small phones (667 px wide): "Pack: Torpedo" in the top bar plus the host's Pause and Exit squeeze the energy bar.

### 2026-10-24 — Stage 1 slice 2: mine

- **Size and look:** trigger circle radius **20** (a ship sets it off when its circle touches). Unarmed: hollow grey circle with small spikes; armed: solid red with a blinking ring. Visible to everyone.
- **Drop:** just behind the stern, clear of the hull (centre 28 + 20 + 2 = 50 behind the ship's centre). If that spot is in the island or off the sea, nothing happens and the crew keeps the mine.
- **Blast (revised the same day):** a mine is set off when a ship touches it (or a shot reaches it, once armed), and then hurts **every ship within its blast radius of 60** (a ship is hurt when its centre is within 28 + 60 = 88 of the mine), the dropper included; then the mine is gone. Found while testing: with 'blast hurts only ships touching it', a shot could never hurt anyone (a ship touching an armed mine sets it off first), so shooting mines would only ever clear them.
- **Respawn protection** stops mine damage like shots and bumps: a protected ship touching an armed mine sets it off but takes no damage.
- **A raised shield halves mine damage** (40% → 20%), the same rule as the torpedo.
- **Own mine:** a ship sunk by its own mine gives nobody the sinking (the log records it as an own-mine hit).
- **Shots set off armed mines:** the shot is used up and the mine blasts every ship touching it. If the blast sinks a ship, the **shooter** scores (nobody if it's the shooter's own ship). Unarmed mines don't stop shots. The same protection and shield rules apply to these blasts.
- **Pack presses can't be lost:** a quick tap of E or the Pack button could fall between two input messages (sent every 50 ms), and a press could be overwritten by the next message before a server tick used it. The client now latches a press until it has been sent once, and the server latches it until a tick has used it. Found by the laptop smoke test (a quick E press didn't drop the mine).
- Smoke tests now use `MATCH_SEED=1` (first pack: a mine at (450, 600)).
- Log `mineTriggered` lines carry `setOffBy` ("ship" or "shot"), `shooter`, and per ship hit `damage` and `ownMine`; drops are logged as `mineDropped` (mine, ship, x, y) after the `packUsed` line.
- Housekeeping: committed the user's Stage 1 edits to `CLAUDE.md` and `docs/design.md`; deleted `CLAUDE.md0` and `docs/design.md0` (identical to the committed versions, i.e. backups).

## Later
