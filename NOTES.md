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
  1. Time zone: after `TZ: Asia/Kolkata` and a recreate, log names were still UTC. Run `sudo docker compose exec server printenv TZ` and `... date` to see whether the setting reaches the container. **Done 2026-10-24** (see "After two packs-on games").
  2. Reload every phone by hand once (pages open before this build lack the self-reload check). **Done 2026-10-25** (Stage 1 slice 6).
  3. A full 4-player match (both crews) run to time-up; check the log ends with `matchEnd` at 240000 ms and the summary shows both crews. **Done 2026-10-25** (Stage 1 slice 6, room FGBL).

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

### 2026-10-24 — After two packs-on games (Stage 1 slice 2 build)

- **Energy refill slowed again:** `energy.refillPerSecond` 7.5 → 5 (empty to full in 20 s).
- **Stage 0 reference re-recorded (approved):** the refill change alters play, so the recorded Stage 0 fight was re-recorded at refill 5 (still 47 hits, 9 sinkings). The recording now stores the tuning it was made with; a test fails with a clear message if `tuning.ts` changes, and the recording must then be re-recorded with approval.
- **Time zone verified:** the container's log files now have local-time names (e.g. `2026-10-24_13-41-25_ZYDS.jsonl`), clearing that Stage 0 "still to verify" item.
- **Packs felt inactive:** in both games the crew picked up a torpedo or an EMP, which only become usable in slices 3–4, and was then stuck holding it (a mine that appeared later couldn't be taken). Decision: no temporary change; build the torpedo and EMP slices next.

### 2026-10-24 — Stage 1 slice 3: torpedo

- **Speed 300** (two-thirds of a shot's 450): slower than a shot, faster than any ship even boosting (270), so a crew can't sail into its own torpedo. Crosses the sea in about 5.3 s.
- **No lifetime limit:** it runs until it hits a ship, the island or the sea edge.
- **Launch:** from just ahead of the bow tip (28 + 2 in front of the centre), along the heading at that moment, at fixed speed (doesn't add the ship's speed). No aiming line.
- **Damage 50% of full health**, halved by a raised shield (CLAUDE.md); **respawn protection blocks it** (the torpedo is used up).
- **Never hits its own ship; sets off armed mines** in its path like a shot (the torpedo is used up; shooter credit rules).
- **Fired by the gunner** (Pack button / E). Allowed **while holding Shield** (Pack isn't Fire).
- **Firing a torpedo ends respawn protection**, like firing the gun. Dropping a mine doesn't (unchanged).
- **Vibration:** 200 ms on the gunner's phone, once, when their crew picks up a torpedo (later also an EMP). Android only. In `tuning.ts`.
- **Look:** dark capsule 22 × 8 pointing the way it travels, with a short white wake; visible to everyone.
- **Quick E taps could be lost (fixed):** Phaser handles key events once per frame, so a tap whose key-down and key-up land in the same frame (likelier on a busy machine) never showed E as down. The scene now also listens for the E key-down event. Found by the laptop mine smoke test under load.
- The Stage 0 reference's "tuning changed" check now covers only the sections that shape a packs-off match (sea, ship, boost, shield, energy, gun, bump, respawn, match), so adding pack or client values doesn't trip it.
- Smoke tests now use `MATCH_SEED=367`: a mine at (450, 300) first, then a torpedo at (450, 600) at 0:22. Torpedo tests use two players (a laptop pilot picks it up; the gunner, on a laptop or an emulated phone, fires it). Steering in the tests is time-based (up to 40 s), and the mouse-fire smoke test waits up to 10 s for the first shot, because ten browser pages at once slow everything down.
- Log: `torpedoFired` (torpedo, ship, x, y, heading), `torpedoHit` (torpedo, attacker ship with gunner name/role, target, damage, `shieldHalved`), `torpedoEnded` (torpedo, ship, reason: island, edge or mine).

### 2026-10-24 — Stage 1 slice 4: EMP

- **Radius 200**: a circle check centred on the firing ship at the moment it fires; an enemy ship is caught if its circle overlaps (centre within 28 + 200 = 228). The firing ship is never affected.
- **Effect 3 s:** caught ships can't fire, boost, shield **or use packs** (the design doc's "weapons"; a held pack stays in the slot). They can still steer. Energy refills as normal, since boost and shield are off.
- **A raised shield drops at once** and can't be raised again until the 3 s are up.
- **Caught again before it wears off:** the 3 s restart from the latest EMP (no stacking).
- **Respawn protection:** protected ships aren't caught; firing an EMP ends the firer's own protection (like the gun and torpedo).
- **Only ships:** shots, torpedoes and mines already in the water are unaffected.
- **Look:** a ring expands from the firing ship to the full radius over 0.4 s, then fades. A caught ship's hull turns grey with flickering blue sparks for 3 s (everyone sees it). The caught crew's Fire, Shield, Boost and Pack buttons go dim, and their top bar shows "EMP 3…2…1".
- Fired by the gunner (Pack button / E); the pickup buzz on the gunner's phone now covers the EMP too.
- The EMP timer counts down at the start of each step, so a ship caught during a step is disabled for exactly the full 3 s whichever ship fired. A respawned ship is never disabled.
- Synced state: each ship's `disabled` seconds and an `empsFired` count (from the simulation's `empFired` events) so clients know when to draw the ring. Log: `empFired` (ship, gunner name/role, `caught` ship ids).
- **Second browser-test server:** the EMP smoke test needs a different `MATCH_SEED` (8: an EMP first, at (800, 150)) from the other pack tests (367), so `playwright.config.ts` starts a second server on port 2578 serving the same build. The EMP test uses three players (Crew 1 pilot and gunner, Crew 2 pilot), steers level onto the pack, then closes in on the enemy and checks it is in range before firing (WASD steering with drift wasn't precise enough to rely on fixed spots). Shared helpers moved to `e2e/helpers.ts`.

### 2026-10-25 — Stage 1 slice 5: summary script additions

- The header says **Packs on** or **Packs off**. Logs from before packs existed (no `packsOn` in the match start) say **Packs off**, since that's how they played.
- With packs on, a second **Packs** table follows, per crew: picked up (M T E H), used and lost (M T E; health is applied on pickup, so never used or lost), average held time, torpedo hits/fired (accuracy), mine hits (own hits apart), EMPs fired and ships caught per EMP, health restored. **With packs off the table is left out.**
- **Mine hits go to whoever set the blast off:** the shooter when a shot set it off (matches the sinking credit), otherwise the mine's owner. A blast hitting that crew's own ship counts as an own hit.
- Average held time is from pickup to use, for used packs only (packs lost on sinking aren't counted). A torpedo that ends on a mine counts as fired without a hit.
- **Watch:** one full browser-test run during this slice had a single failed text check (which test wasn't captured); the next three full runs passed. This slice changed no game code, so it's load flakiness in a browser test. If it comes back, capture which test and fix its timing.

### 2026-10-25 — Stage 1 slice 6: home network play

- Production build checked locally; `docs/playtest.md` replaced by the combined Stage 0 + Stage 1 guide (user's choice). One packs-on check match agreed, played by real people on phones.
- **Reload verified:** every phone was reloaded by hand once and showed the Pack slot, clearing that Stage 0 "still to verify" item.
- **Two check matches played** in Docker over the Wi-Fi (room QHKJ, packs on, a mix of phones and laptops): both ran the full 4:00, ended with `matchEnd` at 240000 ms (not early), logged pack signals, spawns, pickups and health restored, and summarised correctly. But they had 2 and 3 players, so one more full packs-on match with 4 people was played (user's choice).
- **4-player match verified:** two full packs-on matches in room FGBL (Joey & Ira vs Ian & Diana) both ran to 4:00 (`matchEnd` at 240000 ms, not early); the logs show both crews with names and roles, and the summary shows both crews and the Packs table. This clears the last Stage 0 "still to verify" item.
- **No pack was used in either match:** each time a pilot picked up a mine early and held it to the end (which also blocked other pickups). The user confirmed nobody tried to drop it, so it isn't a bug. **No pack was used in any of the five check matches:** in FGBL both crews held a torpedo for minutes (Crew 1 from 0:14 to the end) and the user confirmed the gunners didn't try to fire it. A strong sign the Pack button and the held pack aren't being noticed; for the combined playtest to confirm (no change made now).
- **Flaky browser tests again:** the first full run before the commit had two failed `toHaveText` checks (which tests wasn't captured); the rerun passed all 11. No code changed in this slice. Next time, save the full report to see which test fails.
- **Roadmap addition (user, 2026-10-25):** Stage 5 now includes "to discuss: different ship types based on health, size, rate of fire and damage dealt" (in CLAUDE.md's roadmap and `docs/design.md`).

### 2026-10-25 — Stage 1 slice 7: changes after the check matches (plan change)

Asked for by the user after the slice 6 check matches; added as an extra Stage 1 slice before the combined playtest.

- **Packs nobody picks up disappear** (so new packs keep appearing across the map): `packs.lifetime` **45 s** from when a pack appears (the glow doesn't count). First set to 20 s; changed to 45 s by the user when the browser tests showed a pack could expire before a steered test ship reached it (the tests needed 15–20 s). It **blinks for its last 5 s** (`client.packBlinkTime` 5, `packBlinkHz` 4). Like a pickup, a pack disappearing from a full map starts the 8 s clock to the next signal. New sim event and log line `packExpired` (pack, spot, type). The time left is synced to clients (`PackState.lifeLeft`).
- **Leaving a seat** (so seats can be switched once all 4 are taken): tap your own seat again, or the **Leave seat** button (shown only while seated and no match is on). Either sends the new `leaveSeat` message; the player stays in the room, unseated. Refused during a match (seated players are locked in, as before). The host stays host. No log line: seated players can't leave a seat while a match (and its log) runs.
- **Two pack slots per ship** ("1 pack max for pilot and gunner"): a **pilot slot** (mine) and a **gunner slot** (torpedo or EMP). A pack is picked up when its role's slot is empty, so a ship can hold a mine and a torpedo at once, but not two mines, nor a torpedo and an EMP. Health still uses no slot. Each role's Pack button and E key use only that role's slot. Sinking loses both (one `packLost` each).
  - Top bar (both crewmates): **`Packs: M · T`**, pilot slot first, `—` for an empty slot (letters as on the sea). The phone Pack button shows the name of the pack in that role's own slot.
  - Log: the position line's `held` is now a **list**, e.g. `["mine","torpedo"]` (`[]` when empty). The summary times each slot separately (pickup to use); old logs read as before.
  - Synced state: `pilotPack` and `gunnerPack` replace `held`. `PACK_LETTERS` moved from `GameScene.ts` to `packRules.ts` (the top bar uses it too), with a new `rolePack(ship, role)` helper.
- Tests changed with the rules (not weakened): "can't pick up while holding one" became "can't pick up while its role's slot is full", plus "fills the other slot"; "loses the held pack" became "loses both"; the spawn-clock test runs 30 s instead of 60 s, since packs now disappear; one mine test empties the pilot slot explicitly.
- Packs off is unchanged: the Stage 0 reference recording doesn't include packs or their tuning, so it needed no re-recording, and it still replays identically.
- **Flaky browser tests explained:** the steering helper gives up quietly after 40 s, so a ship that never reached its pack made the next top-bar check fail. With a 20 s pack life this happened every run (the test logs showed the torpedo expiring at 0:42 with no pickup); with 45 s, the full suite passed twice in a row. Running fewer browser tests at once was tried first and didn't help, so it was undone.
- `docs/design.md` updated (user's request): two slots per ship, unpicked packs disappear.

### 2026-10-25 — Stage 1 slice 8: a third ship (plan change)

Asked for by the user before the combined playtest: 3 ship slots now, Frigates only (Stage 5 work brought forward).

- **Ship count:** a match has **3 ships when someone sits in Crew 3 as it starts**, otherwise 2. With 4 players on Crews 1 and 2 it plays exactly as before (the Stage 0 recording still holds). If a match starts with Crew 3 seated but Crew 1 or 2 empty, the empty crew's ship sits there unmanned, as today.
- **Room size:** `MAX_PLAYERS` 4 → **6**; `CREWS` is now `[0, 1, 2]`.
- **Crew 3 during a match without a third ship:** its seats are closed (new refusal `crewNotInMatch`, "Crew 3 joins from the next match."), and open again between matches. Seatless players can still take free Crew 1 and 2 seats mid-match, as before.
- **Crew 3's look:** teal `#2BB3C0` with ▲.
- **3-ship starts** (`START_POINTS_3`): an equal-sided triangle centred on the middle of the sea, 360 from it (about 624 apart, just over gun range): Crew 1 bottom left (488, 630), Crew 2 bottom right (1112, 630), Crew 3 top (800, 90), each facing the middle. The user chose this over a larger triangle with the island off-centre.
- **3-ship pack spots** (`PACK_SPOTS_3`): 6 spots, two in each gap between the starts (15° either side of it, 320 from the middle), so they repeat every 120°. All clear the island by 150 and every start and respawn spot by more than 200 (nearest start: 263). The world now carries its own `packSpots` (today's `PACK_SPOTS` with 2 ships).
- **Packs on the map:** still at most 2, with 3 ships too (the user's choice: scarcer, more of a race).
- **Respawn:** the four corner spots stay; a sunk ship comes back at the one farthest from all enemies, as before.
- **Winning:** most sinkings wins; a tie between the leaders is a draw (already worked for any number of ships).
- **Fix found while building:** the synced state only ever added ships, so a 2-ship match after a 3-ship one would have kept a stale third ship on clients. It now drops it.
- The top-bar score moved to `hud.ts` (`scoreHtml`) so it can be tested with 3 crews. A new browser test (`e2e/threeShips.spec.ts`) runs three pilots, one on a 667 px phone, and checks the top bar still fits.
- Tests changed with the rules (not weakened): room size 4 → 6 (the room-full tests now count to `MAX_PLAYERS`); crew index 2 is now a valid seat (the invalid-seat checks use 3).
- **Watch: load-related browser-test failures.** With the 13th browser test (three browsers at once), 2 of 4 full browser runs had one failure each: the EMP test's steering never reached its pack (the log shows the EMP sat there its full 45 s), and once the smoke test's 3-2-1-Go took longer than its 6 s allowance. The other two runs passed fully. No game cause found.
- `docs/playtest.md`: an extra "3-ship rounds" section for when 6 people are around; the 4-player rounds stay as planned (user's choice).

### 2026-10-26 — Fix: load-related browser-test failures (after slice 8)

- **Cause, from the test servers' logs:** on a busy machine, the key-steering helper (`sailWithKeys` in `e2e/helpers.ts`) read the ship's position late, so ships kept circling their target. A ship arriving side-on can only circle anyway: at full speed its turning circle (radius about 48) is wider than the targets (15–30). Not a game bug.
- **First tries, user's choice (2 runs):** the EMP test's ship sailing to its line-up spot before the pack appears, and a 10 s countdown allowance. Four runs then had 2, 2, 1 and 1 failures: the early sailing made it worse (a circling ship crossed the EMP spot and took the pack before the test watched for it), so it was **reverted**. Running 4 tests at once, measured without changing files, also wasn't enough (1 failure in 2 runs).
- **Fix (user's go-ahead):** the helper eases off within 120 of the target (a short tap, then a pause with keys released), and a ship within 100 but moving more than 60° off the target's direction sails out to 170 and comes back straight. Only the helper changed; what each test checks is the same.
- **Kept:** the 3-2-1-Go countdown allowance is 10 s instead of 6 s, in every countdown check (`smoke.spec.ts` ×4, `phone.spec.ts` ×1). User approved.
- **Result:** 5 full browser runs in a row, 13/13 each.
- The user kept the extra "Two crews ganging up on one?" column in the 3-ship playtest table.

### 2026-10-26 — Combined playtest deferred; Stage 2 planning starts

- **The combined playtest is deferred, still owed** (user's choice). Stage 1 is built, but its definition of done item 5 stays open; the playtest can be run any time, for example alongside Stage 2 testing. `docs/playtest.md` stays as it is.
- **Decisions that were waiting on the playtest stay as planned:** ship types in Stage 5, countdown beeps in Stage 4, and "is the Pack button noticed?" stays a watch item. Any of them can be revisited later.
- **Stage 2's "Current goal" section:** Claude drafts it from `docs/design.md` (scope, slice order, open questions); nothing is built until the user approves it.
- **Stage 2 planning, question 1 (ghost time with 2 ships):** in Last Afloat **each ship has extra lives** before its crew becomes a ghost. The default (**2**) lives in `tuning.ts`; the **host picks 1–5 in the room screen** (shown only with Last Afloat, applies from the next match, like the Packs toggle). 1 plays as plain Last Afloat. Between lives a sunk ship **respawns as in Sink Count** (3 s countdown, safe spot, 2 s protection).
- **Stage 2 planning, question 2 (hazards by mode):** reefs, shipwrecks, the moving storm, the whirlpool and the kraken come in **both Sink Count and Last Afloat**. The closing storm stays Last Afloat only, as in `docs/design.md`.
- **Stage 2 planning, question 3 (what sets off dynamic hazards):** a **seeded timer** in both modes (same seed, same hazards, like packs); **ghosts make hazards come sooner** in the zones they haunt.
- **Stage 2 planning, question 4 (Hazards toggle):** a host-only **Hazards on / off** toggle in the room screen, like Packs, **default on**, applying from the next match. With packs and hazards off on the default map, a match still plays exactly as Stage 0.
- **Stage 2 planning, question 5 (mode choice):** a host-only **Sink Count / Last Afloat** choice in the room screen, **default Sink Count**, applying from the next match. The lives setting (1–5) shows only with Last Afloat. The match-start log line and the summary header record the mode (like Packs on/off).
- **Stage 2 planning, question 6 (how Last Afloat ends):** the **closing storm plus a hard time limit**. The storm starts closing after a set time and leaves a small safe circle by a later time; ships outside it lose health steadily. If more than one ship is afloat at the time limit, the winner is the one with the **most lives left, then the most health**; otherwise a draw. All times go in `tuning.ts` and are proposed in the storm slice (examples discussed: closing from 1:00, small circle by 5:00, limit 7:00).
- **Stage 2 planning, question 7 (ghost controls on a laptop):** **both crewmates steer with WASD**; the ghost follows whoever pressed last. Nothing else does anything for a ghost (no mouse aim, clicks or E). On a phone: the stick, following whoever touched last, no buttons (as in `docs/design.md`).
- **Stage 2 planning, question 8 ("Sunk by…" banner):** yes, in Stage 2: both crewmates get a banner naming the cause, starting with the Stage 1 causes (shot, mine, torpedo, bump) and adding each new cause in its hazard's slice. Text only; no long vibration (the break-apart look is Stage 4 art).
- **Stage 2 planning, question 9 (slice order):** kept as drafted: 1 mode choice and Last Afloat (with lives and the banner), 2 island layouts, 3 Hazards toggle and reefs, 4 shipwrecks, 5 closing storm and time limit, 6 moving storm, 7 whirlpool, 8 kraken, 9 ghosts and haunting, 10 summary script additions and home-network check matches.

### 2026-10-26 — Stage 2 slice 1 plan: mode choice and Last Afloat

- **Question 1 (how Last Afloat ends before the closing storm):** the **hard time limit and tie-break move into slice 1**: the clock counts down from **7:00** in Last Afloat (`tuning.ts`); at 0:00 with more than one ship still in the match, most lives left wins, then most health, otherwise a draw. Slice 5 adds the closing storm on top.
- **Question 2 (what a life means):** lives = how many times a ship can be sunk. With 2, the first sinking respawns it and the second puts it out; with 1, it is out at the first sinking.
- **Question 3 (banner texts):** "Sunk by Crew 2's guns", "Sunk by Crew 2's mine", "Sunk by Crew 2's torpedo", "Rammed by Crew 2", and "Sunk by your own mine". A mine set off by a shot is credited to the shooter and reads "Sunk by Crew 2's guns". A sinking with no one credited keeps Stage 1's "Sunk!".
- **Question 4 (top bar in Last Afloat):** **lives as hearts**: each crew's symbol followed by one ♥ per life left ("● ♥♥ – ■ ♥"), and "out" for a crew that is out. Sink Count keeps showing sinkings.
- **Question 5 (a crew that is out, until ghosts in slice 9):** it **keeps watching** the same view of the sea; its ship isn't drawn; a banner stays up until the match ends ("Out: sunk by Crew 2's torpedo"); the top bar stays; none of its controls do anything.
- **Question 6 (an empty crew's ship):** the host can start Last Afloat only with **at least two crews with players**; otherwise Start shows a message ("Last Afloat needs at least two crews").
  - **Follow-up (6b):** stricter: in Last Afloat **every crew with a ship needs at least one player** (Crews 1 and 2 with 2 ships; all three when Crew 3 is seated), so no unmanned ship is in a Last Afloat match. Start then shows "Every crew needs a player for Last Afloat".
- **Question 7 (room-screen controls):** two side-by-side mode buttons ("Sink Count", "Last Afloat"), the chosen one highlighted, and a 1–5 lives dropdown shown only with Last Afloat; host only. Others see the settings as text ("Mode: Last Afloat · Lives: 2"), like "Packs: on".
- **Built (2026-10-26):**
  - **Simulation:** `createWorld` takes `mode` and `lives`; ships carry `livesLeft` (null in Sink Count) and `out`. In Last Afloat each sinking costs a life; at 0 the ship is out (stays sunk, never respawns; everything already ignores sunk ships). The match ends when one ship (or none) is left in it (`reason: "lastAfloat"`), or at the 7:00 limit (`TUNING.lastAfloat.duration`, `reason: "time"`). `matchResult` in Last Afloat: the only ship still in, else most lives left, then most health, else a draw. Sinkings still count in both modes.
  - **Causes:** every `sunk` event carries `cause`: `shot`, `mine`, `ownMine`, `torpedo` or `bump`. A mine set off by a shot or a torpedo counts as that weapon; sailed into, as `mine` (or `ownMine` for its owner).
  - **Room:** `setMode` / `setLives` (host only, between matches, malformed ignored), `mode` and `lives` synced, plus `matchMode` (the current match's mode, which the game view draws by). Start with Last Afloat and an unmanned crew is refused with `crewsNeedPlayers`.
  - **Log:** match start has `mode` and `lives` (null in Sink Count); `sunk` has `cause` (and `livesLeft` in Last Afloat); new `crewOut`; match end has `reason` (`time`, `lastAfloat` or `endedEarly`) and, in Last Afloat, each ship's `livesLeft`.
  - **Summary:** the header ends with "Sink Count" or "Last Afloat, N lives"; a new "Sunk by" column (times each crew was sunk, by cause; "times sunk" rather than "sinkings made", chosen while building because the hazard slices add causes like the storm; to confirm with the user); with Last Afloat, a table of place, time afloat and lives used.
  - **Client:** the banner keeps the crew symbol already used in Stage 1 ("Sunk by ■ Crew 2's guns"), so colour-blind players can read it (kept while building; to confirm with the user). The scoreboard in Last Afloat reads "● Crew 1: 1 life left · 1 sinking (Joey)". With 2 ships the last sinking ends the match at once, so the "Out: …" banner shows only with 3 ships.
  - **Tests changed with the rules (not weakened):** event checks that compare `sunk` and `matchEnded` exactly now include `cause` and `reason`; the summary's exact per-crew figures include the new `sunkBy`. The Stage 0 replay compares events without the two new Stage 2 fields on a sinking (`cause`, `livesLeft`), as `stage0View` already does for the world; every recorded field still has to match (user's choice).
  - **Browser tests under load:** 14 browser tests now. At the default 4 at a time, 3 of 6 full runs had a failure (the steering helper losing to load, and once the 3-ship test's game view taking over 5 s to show); 2 at a time passed 2 of 2 runs in about the same time. **User's choice: commit without changing it** and keep it as a watch item.

### 2026-10-26 — Stage 2 slice 2 plan: island layouts

- **Question 1 (which layouts):** nine options shown; the user asked for more options, including maps with many small islands that force active navigation, then chose **all nine**: One Island (default), Twin Isles, The Strait, Four Rocks, Crossroads, The Wall, The Ring, Archipelago (about 19 scattered rocks) and Slalom (about 24 rocks in staggered rows). All mirrored left↔right and top↕bottom.
  - **Limit lifted:** the 2026-10-25 rule "1–4 islands per layout" becomes **"1–4 islands, or many small rocks"** (for Archipelago and Slalom).
- **Question 3 (3-ship matches):** **every layout gets hand-placed 3-ship starts and pack spots, roughly fair** (the layouts stay mirrored for 2 ships, not three-way symmetric). Proposed fairness checks in the tests: the three starts roughly equally far apart (and over gun range), and each crew's nearest pack spots and nearest island roughly as far as the others' (within about 15%).
- **Question 4 (Random):** picks from all nine layouts with the match's seed, but **never the previous match's layout** in that room (the first match in a room can be any).
- **Question 5 (room-screen control):** a host-only **"Layout" dropdown** with the nine names plus Random, **default One Island**, between matches, applies from the next match. Others see "Layout: Slalom" / "Layout: Random". Once Random has picked, the game view and the scoreboard show the layout in use ("Layout: Random → The Wall").
- **Question 6 (respawn spots):** **keep today's four corner spots on every layout** (2 and 3 ships); every layout keeps its corners clear of rocks; a sunk ship comes back at the corner farthest from its enemies, as now.
- **Question 7 (narrowest channel):** every channel must let a **Frigate** through (proposed minimum: **70**, Frigate width 56 plus a little room). The user confirmed that in Stage 5 **larger ship types may not fit through every channel**, giving smaller ships shortcuts and a strategic advantage (as already noted under "Later", 2026-10-25: every start, pack and respawn spot must still be reachable by every type).
- **While building: 3-ship fairness checks changed (user's choice):** the proposed "each crew's nearest island about as close as the others' (within 15%)" couldn't be met sensibly on mirrored layouts (only placements in the dead centre or against the edge passed). **Replaced by open water:** every 3-ship start at least 95 from any shore. Kept: starts equally far apart (within 15%) and over gun range, and equally near their two nearest pack spots (within 15%).
- **While building: three layouts reshaped slightly (user's choice, over falling back to One Island or loosening the rules):** The Strait, Archipelago and Slalom had no room for three fair 3-ship starts, so they get open bays: The Strait's long islands are shorter; Archipelago loses its four rocks nearest the top and bottom middle; Slalom loses six rocks (the middle ones at the top and bottom edges, and four in the outer columns) and has 18.
- **Built (2026-10-26):**
  - **`shared/src/sim/layouts.ts`:** the nine layouts. Rocks are 8-point shapes, irregular but symmetric, so mirrored copies match exactly. 3-ship starts are equal-sided triangles around the middle (Crossroads: a mirrored triangle), with pack spots in pairs that repeat every 120°; found with a small search script against the checks, then written in as numbers.
  - **The world carries its layout:** `layout` and `islands`; steering, the push-out, shots, torpedoes and mine drops use every island (`pushOutOfIslands`, and `traceShot` / `canDropAt` take a list). One Island keeps the Stage 0 recording matching.
  - **Checks (`layouts.test.ts`):** mirror image (not One Island, which is today's irregular island); starts and corners clear by 3 ship radii; pack spots 60 from any shore, over 200 from starts and respawns, and over 100 from each other; every channel (between islands and to the sea edge) at least 70; a Frigate can reach every spot from a start (a flood fill on an 8-unit grid); 3-ship starts within 15% of each other in distance and over gun range, equally near their two nearest pack spots (within 15%), and at least 95 from any shore.
  - **Rocks counted:** The Ring has 6 rocks, so it counts as "many small rocks" with Archipelago (17) and Slalom (18); the others have 1–4 islands.
  - **Room:** `setLayout` ({ layout: id or "random" }, host only, between matches); `layout` (the setting) and `matchLayout` (in use) synced. Random: `randomLayout(seed, previous)` uses its own copy of the match seed, so packs are unchanged.
  - **Client:** a Layout dropdown for the host; others see "Layout: Slalom"; with Random everyone sees "Layout: Random → The Wall" once a match has picked. In the game the banner names the layout during the 3-2-1 (also on a resume); the scoreboard ends with the layout line. The room screen's dropdown now uses the page font (it showed tiny).
  - **Log and summary:** match start has `layout` and `layoutRandom`; the summary header ends with the layout's name and "(Random)" when picked by Random; logs from before layouts read as One Island.
- **Question 2 (names):** keep the names as shown: One Island, Twin Isles, The Strait, Four Rocks, Crossroads, The Wall, The Ring, Archipelago, Slalom.

### 2026-10-26 — Stage 2 slice 3 plan: Hazards toggle and reefs

- **Question 1 (reef placement):** reefs hand-placed per layout, mirrored both ways, at least a ship's length clear of every start, respawn and pack spot (2 and 3 ships), not touching islands. Pictures shown and **kept as shown**: One Island 4 (off the island's corners), Twin Isles 5 (middle of the lane, four near the corners), The Strait 4 (either side of the channel's entrances), Four Rocks 5 (middle, four on the flanks), Crossroads 3 (crossing, one in front of each start), The Wall 2 (long, in front of both faces), The Ring 6 (one in each gap), Archipelago 4 (round the middle rock), Slalom 4 (the gates beside the middle column). Sizes about 90 × 70 (The Wall's 90 × 240, Twin Isles' middle 180 × 110).
  - **Host setting for the amount of reefs** (user's choice over a separate on/off checkbox or only the Hazards toggle): a dropdown None / Few / All. **Default: All.** **Few** keeps (confirmed): a diagonal pair (top-left and bottom-right) where reefs come in fours (One Island, The Strait, Archipelago, Slalom); the middle reef on Twin Isles, Four Rocks and Crossroads; the left and right gaps on The Ring; both reefs on The Wall (same as All). **Hazards off means no reefs** whatever the Reefs setting; the dropdown is greyed out then.
- **Question 2 (One Island):** **One Island gets reefs too** (the 4 shown). With hazards on (the default), a default match now has reefs; with packs and hazards off it still plays exactly as Stage 0.
- **Question 3 (slowdown):** on a reef a ship's top speed is **50%** of normal, boosted or not (`tuning.ts`).
- **Question 4 (damage):** **5% of full health on entering** a reef; leaving and coming back hits again.
- **Question 5:** respawn protection blocks reef damage; a raised shield doesn't help.
- **Question 6 (banner):** "Wrecked on a reef" ("Out: wrecked on a reef" in Last Afloat); no crew gets the sinking.
- **Question 7:** a ship is on a reef when its **centre** is over it.
- **Built (2026-10-26):**
  - **Layouts:** each carries `reefs` (All) and `fewReefs`; `reefsFor(layout, amount)`. Checks added: reefs mirrored both ways, every reef at least 68 (a ship's length plus a little) from every start, respawn and pack spot (2 and 3 ships), not touching islands, Few part of All and the same from either 2-ship start.
  - **Simulation:** `createWorld({ hazards, reefs })`, hazards off by default (so Stage 0 and 1 play as before); the world has `hazardsOn` and the match's `reefs`; ships carry `onReef`. A ship whose centre enters a reef takes 5% (`reefHit`, not while protected) and steers at half top speed while on it (`steerShip`'s new `speedFactor`, applied from the step after entering). Sinking on a reef: cause `reef`, no credit.
  - **Room:** `setHazards` ({ on }) and `setReefs` ({ reefs }), host only, between matches; synced `hazardsEnabled` (default on), `reefs` (default "all") and `matchReefs` (what the match has, "none" with hazards off).
  - **Client:** reefs drawn as lighter shallow water with a dotted edge, under islands, ships and packs. Host: "Hazards on" checkbox and Reefs dropdown (greyed out with hazards off); others see "Hazards: on · Reefs: All" or "Hazards: off". Banner "Wrecked on a reef".
  - **Log and summary:** match start has `hazardsOn` and `reefs`; new `reefHit` line (ship, crew, damage). Summary header ends "Hazards on, reefs Few" or "Hazards off"; with hazards on a "Reef hits (damage)" column.
  - **Existing browser tests now play with reefs** (hazards on is the room default): One Island's reefs sit off the island's corners, clear of the pack spots, but a test ship circling near the EMP spot can cross them.
  - **Browser tests under load (watch item):** 16 browser tests now. Full runs after this slice: 7 runs, 4 with one failure each (3-ship game view slow to appear twice, EMP test twice; once the reef test, before it moved from The Wall to Twin Isles' longer reef). Tried turning hazards off in the pack and EMP tests: the EMP test still failed 2 of 4 runs, so that was put back (no test changed for it).

### 2026-10-26 — Stage 2 slice 4 plan: shipwrecks

- **Question 1 (what a wreck blocks):** ships and shots, like a small rock, until it's destroyed (cover you can shoot away).
- **Question 2 (health and damage):** 60 health (three gun shots); torpedoes (50) and mine blasts (40) do their normal damage. **Bumping a wreck hurts both, the wreck more than the ship** (values in the follow-up below).
- **Question 3 (pack chance):** 50% of wrecks hold a pack, the four types at the usual equal odds, from the seeded generator.
- **Question 4 (showing the pack):** b) a glint shows a wreck holds a pack, not which type.
- **Question 5 (the released pack):** appears where the wreck was and can be picked up at once (no glow); lasts 45 s and blinks out like other packs; doesn't count toward the 2-on-the-map limit; with Packs off, wrecks hold nothing.
- **Question 6:** a) a destroyed wreck is gone for the rest of the match.
- **Question 7:** a) the Hazards toggle alone covers wrecks (all of the layout's wrecks); no Wrecks dropdown.
- **Points 8–11** (placement, credit, mines and torpedoes, look, log and summary): as proposed in the plan, no change asked.
- **Follow-up 1 (placement):** approved as drawn. Hull 70 long, 26 wide, at 30° (mirrored). 4 wrecks per layout, mirrored like the reefs: One Island (450, 125), Twin Isles (600, 350), The Strait (600, 325), Four Rocks (650, 125), Crossroads (350, 325), The Wall (650, 300), The Ring (450, 125) (top-left one given; the others are mirror images). 2 wrecks on Archipelago, on the middle line at (600, 450), lying flat; and on Slalom, in the middle column at (800, 200), lying flat. Each is at least 68 from every start, respawn and pack spot (2 and 3 ships), at least 70 from islands and the sea edge, and clear of reefs.
- **Follow-up 2 (ramming a wreck):** a) the existing bump formula on the ship's speed: the ship takes a normal bump, the wreck 3×. Only when contact starts; a shield or respawn protection protects the ship. Breaking a wreck by ramming credits the rammer.
- **Follow-up 3 (banner):** a) a ship sunk by ramming a wreck: cause `wreck`, no crew credited, "Wrecked on a shipwreck" ("Out: wrecked on a shipwreck" in Last Afloat).
- **Tool note:** while searching for wreck spots, `npx tsx` downloaded tsx 4.23.15 into npm's per-user cache without asking (not into the project or system-wide). Scripts use Node's built-in type stripping instead; npx isn't to be used for packages that aren't already installed. The downloaded folder was deleted at the user's request.
- **Built (2026-10-26):**
  - **Tuning:** `wreck` { length 70, width 26, health 60, packChance 0.5, ramFactor 3 }.
  - **Layouts:** each carries `wrecks` (centre and angle); `wreckHull` gives the hull (pointed bow, square stern). **Slalom's two wrecks stand north–south** (bows toward the middle), not lying flat as first drawn: a flat hull on the middle column isn't its own left↔right mirror image, so the mirror check would fail. Same spots, already checked at that angle. Checks added: 2 or 4 wrecks, mirrored both ways, at least 68 from every start, respawn and pack spot, not touching reefs; the channel check (at least 70 between islands, wrecks and the sea edge) and the Frigate reachability check now count wrecks as solid.
  - **Simulation:** `createWorld` places the layout's wrecks with hazards on (none with hazards off). Wreck packs are drawn from their own copy of the seed (so the map's packs are the same with hazards on or off), only with packs on. Wrecks block ships (pushed out like islands), shots and torpedoes (`traceShot` reports a wreck; torpedo ends with reason `wreck`) and mine drops; mine blasts reach them. Ramming: a new contact (kept in `contacts` as "ship:wN") deals the bump formula on the ship's speed into the hull to the ship (none while shielded or protected) and 3× to the wreck. At 0 health the wreck is gone for the match; its pack, if any, is added at the end of the step where the wreck stood (`world.wreckPacks`), can be taken from the next step, lasts 45 s (`packExpired` with spot null) and plays no part in the spawn clock or the 2-pack limit.
  - **Events:** `wreckHit` (wreck, by, weapon shot/torpedo/mine/bump, damage; **a ram also carries `shipDamage`**, the ramming ship's damage, rather than a separate event), `wreckDestroyed` (wreck, by), `wreckPackReleased` (wreck, pack, type); sinking on a wreck is cause `wreck`, no credit.
  - **Room:** synced `wrecks` map (by layout index: health, hasPack; the type stays hidden); wreck packs go in the `packs` map; a ship hurt ramming a wreck flashes.
  - **Client:** a dark wooden hull broken in two (drawn above reefs and islands, under packs and ships), a crack line at 2/3 and another at 1/3 health, a white flash when hit, a pulsing glint on one holding a pack. Banner "Wrecked on a shipwreck".
  - **Log and summary:** match start lists the wrecks (wreck, x, y, pack); `wreckHit`, `wreckDestroyed`, `wreckPackReleased` lines. With hazards on, a "Wrecks destroyed (packs released)" column; "wreck" shows in "Sunk by".
  - **Browser test** `e2e/wrecks.spec.ts`: on One Island with seed 367 wreck 1 at (1150, 125) holds a mine; the Crew 2 laptop gunner shoots it to pieces and the Crew 2 pilot sails over the mine. Its first wait (for the game view) is 15 s, because under load the game view took over 5 s to appear in 2 of its first 3 full runs.
  - **Browser tests under load (watch item):** 17 browser tests now. Full runs after this slice: 5 runs, every one with a failure: the EMP test (3 runs), the 3-ship game view slow to appear (1), the new wreck test's game view (2, before its longer wait) and once the laptop mine-pack test, whose ship overshot the mine under load and sailed over the torpedo spot instead (its log shows no wreck contact). The failing tests pass when run on their own.

### 2026-10-26 — Stage 2 slice 5 plan: closing storm

- **Question 1 (timing):** closes from 1:00 into the match (clock 6:00) to the small circle at 5:00 (clock 2:00), shrinking smoothly; stays at that size until the 7:00 limit.
- **Question 2 (shape):** a circle centred on the middle of the sea, radius 918 (covers the corners) down to **300**. "OK for now, we can fine tune."
- **Question 3:** a) 5 health (5% of full) every second for a ship whose centre is outside the circle; a shield doesn't help.
- **Question 4:** a) a ship respawning while its corner is in the storm comes back pulled in toward the middle until 60 inside the circle, clear of islands and wrecks; respawn protection also blocks storm damage.
- **Question 5:** a) the storm only comes with Hazards on; with Hazards off, Last Afloat plays as before (time limit only).
- **Question 6:** dark grey storm outside the circle with a jagged edge; the final circle as a faint dashed line from the match start; a small status line at the top of the sea ("Storm in 0:42", "Storm closing", "Storm closed"), not in the top bar; a) your hull flashes red with each tick and "In the storm!" shows.
- **Question 7:** a) packs keep spawning at their usual spots, inside the storm too.
- **Question 8:** mines and torpedoes are unaffected by the storm.
- **Points 9–10** (log and summary, tuning names): as proposed.
- **Browser test:** a test-only setting on a test server (environment variables, like `MATCH_SEED`) makes the storm close sooner, so the test can see storm damage. Real games are unaffected.
- **Built (2026-10-26):**
  - **Tuning:** `closingStorm` { startsAt 60, closedAt 300, startRadius 918, endRadius 300, damage 0.05, tickSeconds 1, respawnInset 60 }.
  - **Simulation** (`sim/storm.ts`): the world carries `storm` (its times, or null), set for Last Afloat with hazards on. The radius shrinks linearly between the two times. Every whole second after it starts closing, each ship afloat and not protected whose centre is outside the circle takes 5 (`stormDamage`); sinking is cause `storm`, no credit, and costs a life. `stormStarted` and `stormClosed` mark the two times. While the storm closes, a respawning ship's chosen corner is pulled in toward the middle until 60 inside the circle, then further in until clear of islands and wrecks (checked on every layout, from every corner, at every size).
  - **Test-only setting:** `STORM_STARTS_AT` and `STORM_CLOSED_AT` (both needed) set the storm's times; the second test server (port 2578) uses 2 and 12. The EMP test on that server plays Sink Count, so it has no storm.
  - **Room:** synced `matchStorm`, `stormStartsAt`, `stormClosedAt`, `stormRadius`; each ship's `stormHits` (for the red flash).
  - **Client:** the storm as an even dark shade outside the circle with a shifting jagged edge (drawn over the sea, islands and wrecks; packs, mines and ships stay on top so packs in the storm can be seen), the final circle as a faint dashed line all match; storm hits flash the hull red. Status line at the top of the sea ("Storm in 0:42", "Storm closing", "Storm closed", or "In the storm!" in red while your ship is outside); while it shows, the sink banner sits a little lower, below it. Banner "Lost to the storm" ("Out: lost to the storm").
  - **Log and summary:** match start records `storm` (its times, or null); `stormStarted`, `stormClosed`, `stormDamage` (ship, crew, damage) lines. A "Storm damage" column for a match with the storm; "storm" shows in "Sunk by".
  - **Browser test** `e2e/storm.spec.ts` (port 2578): a Last Afloat match with hazards on; the status line goes from "Storm in…" to "Storm closing" to "In the storm!" for a ship left at its start, and its health drops.
  - **Browser tests under load (watch item):** 18 browser tests now. Full runs after this slice: 4 runs. Run 1: the reef test (its position samples under load jumped right over the reef stretch, giving a NaN speed). Run 2: the new storm test (its middle check allowed 5 s; the page still showed "Storm in 0:01" then; now 15 s). Run 3: the Last Afloat test: the enemy ship circled its target for about 50 s before the steering helper gave up, so the host's shots never reached it. On the way it bumped One Island's wrecks 1 and 0 (wrecks came in slice 4), so the wrecks near that test's route may add to the load problem. Not changed: it's an existing test (asked the user). Run 4: all 18 passed.
  - **Answer (slice 6 planning):** a) leave the Last Afloat test as it is and keep watching.

### 2026-10-26 — Stage 2 slice 6 plan: moving storm

The first dynamic hazard; the slice also builds the shared **hazard timer** that the whirlpool and kraken join later.

- **Plan as proposed:** hazards on only, both modes. The timer is seeded from its own copy of the match seed (like the wrecks), so pack spawns are the same with hazards on or off. A pulsing dashed ring with an arrow signals the spot for 3 s. The storm appears near a ship picked with the seed (centre 250 from it, edge at least 50 clear of every ship, inside the sea; it may lie over islands), drifts in a straight line toward where that ship was when signalled, passes over islands and wrecks, and ends when its time is up or its centre leaves the sea (1 s fade).
- **Question 1 (push):** a) along the storm's direction: a ship whose centre is inside is carried along; islands and wrecks still block it.
- **Question 2 (damage):** a) none. Damage comes from what the push carries a ship into (reefs, wrecks, other ships).
- **Question 3 (visibility):** nobody sees into the cloud except their own ship (and its aiming guide). Islands, reefs and wrecks show faintly through it; **shots stay visible, like tracers**. Follow-up: a) torpedoes, mines and packs inside stay hidden, like ships.
- **Question 4:** a) shots pass through the storm unchanged.
- **Question 5 (values), ok:** first hazard 30 s in; the next 30–50 s (seeded) after the previous one ends; at most 1 active (revisit with whirlpool and kraken); signal 3 s; radius 120; drift 50; lifetime 16 s plus 1 s fade; push 70.
- **Question 6 (existing browser tests):** a) a test-only `HAZARDS_FIRST_AT` setting: "never" on ports 2577 and 2578, and a third test server on port 2579 with storms from 0:02 for the new test.
- **Question 7 (log and summary), ok:** `hazardSignalled` (hazard, id, pos, heading), `hazardStarted`, `hazardEnded` (reason time or edge), `stormEntered` (ship, hazard); storm positions in the once-a-second lines; a per-crew "Time in moving storms (s)" column.
- **Known limit:** the server still sends hidden ships' positions, so someone reading the network data could see them; fine for a home game.
- **Change while building (asked, user chose b):** with push 70 faster than the drift 50, a waiting ship never got inside: it rode just outside the front edge, bulldozed along (the plan wrongly said it would come out the front after a few seconds). **Push is now 40**, slower than the drift: the storm swallows a waiting ship and slowly passes over it (crossing the whole cloud would take longer than the storm lasts), so a caught ship stays hidden unless it sails out.
- **Added while building:** a `stormLeft` event (ship, hazard), needed for the "Time in moving storms" column; it is also logged when the storm ends or the ship sinks with the ship inside. `matchStart` records `firstHazardAt` (null for none). The once-a-second lines add a `hazard` line per hazard on the sea (id, kind, phase, x, y).
- **Built (2026-10-26):**
  - **Tuning:** `hazards` { firstAt 30, minGap 30, maxGap 50, maxActive 1, signalTime 3, distanceFromShip 250, clearance 50, retryAfter 1 }; `movingStorm` { radius 120, speed 50, lifetime 16, fadeTime 1, push 40 }.
  - **Simulation** (`sim/hazards.ts`): the world carries `hazards`, `nextHazardId`, `nextHazardIn` (null: no dynamic hazards this match), `hazardRng` (its own copy of the seed) and `hazardContacts`. The timer counts only while fewer than `maxActive` hazards are on the sea; when it runs out it picks a ship afloat and tries up to 12 seeded directions for a clear spot (otherwise it tries again a second later). A storm is signalled for 3 s, then drifts toward where the picked ship was, stops acting after 16 s or when its centre leaves the sea (`hazardEnded`, reason time or edge), fades for 1 s and is gone. Each step, active storms push ships afloat whose centre is inside (protected ones too), before islands, wrecks and the sea edge push ships out. Pack spawns are unchanged with hazards on or off; packs and hazards off on One Island still matches the Stage 0 recording.
  - **Room:** synced `hazards` map (kind, phase, x, y, heading, timeLeft).
  - **Client:** signal as a turning dashed ring with an arrow; the cloud as a dark, billowing disc with slowly turning swirls, fading out at the end. It is drawn over other ships, torpedoes, mines and packs (pack letters are hidden under it); islands, reefs and standing wrecks under a cloud show as faint outlines; shots and your own ship (with its aiming guide) are drawn on top. `data-hazards` and `data-hidden` (ships a storm hides from this player) for the browser tests.
  - **Log and summary:** `hazardSignalled`, `hazardStarted`, `hazardEnded`, `stormEntered`, `stormLeft`; a "Time in moving storms (s)" column with hazards on (placed before the reef column).
  - **Test-only setting:** `HAZARDS_FIRST_AT` (seconds, or `never`); ports 2577 and 2578 use `never`; a third test server (port 2579, seed 367) uses 2 for `e2e/movingStorm.spec.ts`: the storm forms near Crew 2's waiting ship, swallows it, and Crew 1's page hides it while Crew 2's doesn't.
  - **Browser tests under load (watch item):** 19 browser tests now. 5 full runs, none fully passed: 1 failure (3-ship page slow), 1 (EMP steering), 3 (mine-pack overshoot, EMP, 3-ship), 3 (phone aiming, mine-pack, EMP), and with 2 at a time 2 (mine-pack, pause/exit). The new moving-storm test passed every time; the failing tests pass alone; the servers they use have moving storms off. Load average during runs: 12–16 on 8 cores (with the user's browser open). Not committed: asked the user. The user agreed to retry with the browser closed: still 2 failures (3-ship page slow, EMP); the load average reached about 12 from the tests alone. Two more runs with the third test server switched off (and the moving-storm test skipped) still had failures (2: 3-ship, EMP; then 1: 3-ship), so the third server isn't the cause. The 3-ship test's game view (`data-ships` "3") failed to appear within its 5 s wait in 4 of the last 8 runs.
  - **Answer:** b) the 3-ship test's game-view wait goes from 5 s to 15 s (like the wreck and storm tests; what it checks is unchanged). The next full run passed 19 of 19; committed. EMP steering failures stay a watch item.

### 2026-10-26 — Stage 2 slice 7 plan: whirlpool

- **Plan as proposed:** hazards on, both modes, on the slice 6 hazard timer, which now picks a moving storm or a whirlpool with the seed (equal chances in `tuning.ts`). Signalled 3 s (dashed ring with turning arrows showing the spin, the spin direction seeded). Placed like the storm (250 from a ship, its reach at least 50 clear of every ship); it stays put; its centre clear of islands and wrecks (the pull may reach over them). Lasts 15 s, then fades over 1 s. Shots, torpedoes, mines and packs are unaffected; it hides nothing.
- **Question 1 (the eye):** c) **no damage**; the eye only traps the ship Follow-up: a) **boost out**: inside the eye the pull (170) is stronger than full sail (150), so only boosting (270, costing energy) gets a ship out; outside the eye the pull is 20 at the edge rising to 90. With no damage the whirlpool can't sink a ship, so there is no sinking cause or banner for it (damage comes from what it carries a ship into, as with the moving storm).
- **Question 2:** a) both an inward pull and a swirl around it; riding the swirl along the edge is the slingshot.
- **Question 3 (values), yes:** reach 180, eye radius 35, pull 20 at the edge rising to 90 at the eye, swirl 80, lifetime 15 s plus 1 s fade, chances storm 1 : whirlpool 1. (Eye damage dropped by question 1.)
- **Question 4:** a) still 1 hazard at a time; decide after the kraken or the playtest.
- **Question 5:** "Swallowed by the whirlpool" was ok, but isn't needed now (no sinking by the whirlpool).
- **Question 6:** a) a fourth test server (port 2580) with a seed whose first hazard is a whirlpool; the third server's seed changes if needed to keep a storm first.
- **Question 7:** log and summary as proposed, without eye damage: `whirlpoolEntered`, `whirlpoolLeft`; `hazardSignalled` with kind and spin; a per-crew "Whirlpool time (s)" column.
- **Found while building (asked):** a whirlpool can't be both 250 from the picked ship and have its reach (180) plus a ship (28) plus the clearance (50) = 258 clear of every ship. Built with the whirlpool appearing **260** from the picked ship (`whirlpool.distanceFromShip`); the moving storm keeps 250. So the picked ship starts 80 outside the reach: a waiting ship isn't pulled in; it has to sail in (or be pushed in). **Answer: 260 is ok.**
- **Built (2026-10-27):**
  - **Tuning:** `hazards.chances` { movingStorm 1, whirlpool 1 }; `whirlpool` { reach 180, eyeRadius 35, edgePull 20, innerPull 90, eyePull 170, swirl 80, distanceFromShip 260, lifetime 15, fadeTime 1 }.
  - **Simulation** (`sim/hazards.ts`): the timer draws the kind with the seed, then the spot (`placeHazard`; for a whirlpool its whole reach inside the sea and its eye clear of islands and standing wrecks), then a whirlpool's spin (1 clockwise, -1 anticlockwise on screen). Each step an active whirlpool moves a ship afloat whose centre is within its reach: inward by the pull (20 at the edge rising to 90 at the eye's edge, 170 inside the eye; never past the middle) and round by the swirl (80). Whirlpools don't move. No damage. `whirlpoolEntered` / `whirlpoolLeft` like the storm's events.
  - **Room and client:** hazards carry `spin`. Signal: a dashed ring at the reach with four arrowheads turning the way it will spin. Active: darker water to the reach with a faint edge, three turning spiral arms of foam and a dark eye, under everything that floats; it fades out at the end.
  - **Log and summary:** `hazardSignalled` has `spin` for a whirlpool; `whirlpoolEntered`, `whirlpoolLeft`; a "Whirlpool time (s)" column after the moving-storm one.
  - **Test servers:** port 2579's seed changed from 367 to 6 (the kind draw comes first now, and 367's first hazard is no longer a storm swallowing Crew 2's ship); a fourth server, port 2580 with seed 8 (a whirlpool 260 east of Crew 1's start), for `e2e/whirlpool.spec.ts`: the laptop pilot sails into the eye and the eye holds the ship with the keys let go.
  - **Tests changed:** the first-hazard test now accepts either kind (the kind is drawn with the seed); placement tests call `placeHazard`; the summary column test for moving storms allows the new column after it.
  - **Browser runs:** 20 browser tests. 3 full runs, each with 2 load failures (phone mine-pack top bar not shown yet and the reef test's NaN speed; laptop mine-pack and EMP; reef NaN and EMP). The two new hazard tests passed every time. **Answer:** commit slice 7 as it is and keep watching; then a short **browser-test reliability slice** before the kraken (plan first, as usual).

### 2026-10-27 — Browser-test reliability slice: plan

Agreed after Stage 2 slice 7, before the kraken.

- **Measured** (one full run, 4 tests at a time): Chrome's GPU processes (software drawing in headless Chrome) about 100% CPU each, 4 of them; each game page about 15%; the game servers hardly any. Load average up to 25 on 8 cores. Every page draws at 60 frames a second, even pages that only fill a seat. The failures come from tests reading ship positions late on the busy machine.
- **Question 1 (order), ok:** try, one at a time, with 5 full runs after each (failures, run time, load), stopping at the first that gives 5 clean runs in a row: 1) Chrome uses the laptop's graphics chip (Intel Iris Xe) instead of software drawing (launch settings in `playwright.config.ts` only); 2) a test-only `?fps=20` page-address setting caps drawing at 20 frames a second (Phaser's own limit; real games unchanged); 3) 2 tests at a time instead of 4.
- **Question 2, ok:** a hidden `?fps=` switch in the client, if step 2 is needed.
- **Question 3, agreed:** no Playwright retries (they would hide real failures).
- **Question 4, ok:** the reef test measures speed without dividing by nothing when its samples jump the reef stretch (more samples, or the server log); what it checks stays the same.
- **Question 5, ok:** done means 5 clean full runs in a row.
- **Step 1 results:** with Chrome's settings `--enable-gpu --ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan`, WebGL in headless Chrome reports the Iris Xe (other settings still gave SwiftShader, software drawing). 5 full runs in a row passed 20 of 20 (151–181 s each). A 6th run, taken to sample the processes, had 1 failure (the phone torpedo pack test). During it the GPU processes used about 30% CPU each (was about 100%), but the pages still ran at about 160% together (60 frames a second) and the load average was still 20–31.
- **Reef test:** the page now records every change of the ship's x itself (a MutationObserver on `data-own-x`, with `performance.now()`), so samples can't jump the reef stretch however slow the test machine is. Same speed comparison as before.
- **Next step (asked):** step 1 met the bar but the 6th run failed and the load stayed high, so the user chose to **also do step 2**.
- **Step 2 results:** `?fps=20` (`client/src/game/frameLimit.ts`, read in `game.ts` as Phaser's `fps.limit`; whole numbers 1–60, otherwise ignored); every browser test opens `GAME_PAGE` ("/?fps=20", in `e2e/helpers.ts`). Checked: the page draws 20 times a second instead of 60. Runs: 3 passed, then 1 failure (phone torpedo pack test, the same one as step 1's 6th run), 2 passed, then 1 failure (laptop torpedo test). Sampled with `top`: the pages still used about 300% CPU together and the GPU processes about 170%; the rest was spread thin (test workers, game servers, the terminal). Drawing is no longer the main cost; 10–12 game pages at once simply fill the 8 cores.
- **Step 3 results:** `workers: 2` in `playwright.config.ts` (steps 1 and 2 kept). Runs: 194 s, 214 s, 214 s, all 20 of 20; one run voided (the laptop went to sleep in the middle, 10:58); then 174 s and 193 s, 20 of 20. That is 5 clean runs; the final `npm test` passed too (807 unit plus 1 skipped, 20 browser). Peak load 15–23 (was 25–32). A full run now takes about 3–3.5 minutes (was about 2.5).
- **Kept:** all three steps. Step 2 didn't show a clear drop in CPU on its own, but it does cut drawing to a third and costs nothing in real games.

### 2026-10-27 — Stage 2 slice 8 plan: kraken

- **Plan as proposed:** hazards on, both modes, on the hazard timer, which now picks a moving storm, a whirlpool or a kraken with the seed (equal chances). Signalled 3 s (ripples and bubbles). Placed like the others (a set distance from a picked ship, clear of every ship; its body in open water, clear of islands and wrecks). It swims toward the nearest ship afloat and not protected (switching as ships move) and grabs it when in reach; each kraken grabs once, then lets go and dives (ends); with no grab it dives after its time. A ship sunk while held: cause `kraken`, nobody credited.
- **Question 1:** a) a grab holds the ship 3 s, dealing damage each second.
- **Question 2:** a) shots and torpedoes from any crew hurt the kraken; at 0 health it lets go and dives at once.
- **Question 3:** a) while held, the pilot can't steer or boost; the gunner can still aim, fire and shield.
- **Question 4:** a) it swims under islands and wrecks.
- **Question 5 (values), yes:** body radius 35; grabs a ship whose centre is within 70 of its middle; swims at 60; appears 300 from the picked ship; hold 3 s; 10% of full health per second while held; health 60 (3 shots; a torpedo does 50); dives after 20 s without a grab; chances storm 1 : whirlpool 1 : kraken 1.
- **Question 6:** still 1 hazard at a time.
- **Question 7:** banner "Taken by the kraken" ("Out: taken by the kraken").
- **Question 8:** a) a fifth test server with a seed whose first hazard is a kraken.
- **Question 9:** log and summary as proposed: `hazardSignalled` (kind kraken), `hazardEnded` (reason time, grab or shot), `krakenGrab`, `krakenDamage`, `krakenReleased` (reason time, shot or sunk), `krakenHit` (by, weapon, damage); a per-crew "Kraken grabs (damage)" column.
- **Chosen while building, confirmed by the user (2026-10-27):** a raised shield doesn't soften a kraken's hold damage (like the closing storm). A torpedo that hits a kraken ends with `torpedoEnded` reason "kraken" (like "wreck"). While held, the pilot can still drop a loaded mine (only steering and boost are stopped).
- **Built (2026-10-27):**
  - **Tuning:** `hazards.chances` gains kraken 1; `kraken` { bodyRadius 35, grabReach 70, speed 60, distanceFromShip 300, holdTime 3, damage 0.1, tickSeconds 1, health 60, lifetime 20, fadeTime 1 }.
  - **Simulation** (`sim/hazards.ts`): a kraken carries `health`, `holding` and `holdLeft`. Each step while active and not holding, it swims toward the nearest ship afloat and not protected (switching as ships move, under islands and wrecks) and grabs it once its centre is within 70; it dives (reason time) after 20 s without a grab. Holding, the hold runs down; at each whole second the held ship takes 10 (`krakenDamage`, logged before the kraken's own events); after 3 s it lets go (`krakenReleased` time, `hazardEnded` grab); if the held ship sinks it lets go (sunk). A held ship can't steer or boost (its velocity is held at 0). Shots and torpedoes stop at an active kraken's body (`traceShot` gains krakens) and hurt it (20 and 50, `krakenHit`); at 0 it lets go (shot) and dives (`hazardEnded` shot). Sinking while held: cause `kraken`, nobody credited.
  - **Fix found by a test:** the "caught by" check for storms and whirlpools now names each kind; a kraken fell into the whirlpool branch and pulled the held ship.
  - **Room and client:** hazards carry `health` and `holding` (-1 for none); ships `krakenHits` (the hull flashes red, sharing the closing storm's flash). Signal: rings of ripples and bubbles. Active: a purple body with eyes toward its target and eight waving tentacles (the ones facing a held ship wrap it), flashing white when shot; it fades when it dives. Banner "Taken by the kraken" ("Out: taken by the kraken"). `data-held` (ships a kraken holds) for the browser tests.
  - **Log and summary:** `krakenGrab`, `krakenDamage`, `krakenReleased`, `krakenHit`; "Kraken grabs (damage)" column after the whirlpool one.
  - **Test servers:** a third kind changed which hazard each seed draws first, so the seeds moved: port 2579 seed 14 (moving storm), port 2580 seed 3 (whirlpool at (305, 241)), and a fifth server, port 2581 seed 8 (kraken at (449, 430), grabs Crew 1 at about 0:09) for `e2e/kraken.spec.ts`.
  - **Tests changed:** the whirlpool "how often" test now expects about a third (20–47 of 100) instead of a half; summary column patterns allow the new column.
  - **Runs:** `npm test` passed (832 unit plus 1 skipped, 21 browser) and a second full browser run passed 21 of 21 (193 s, peak load 21).

### 2026-10-27 — Stage 2 slice 9 plan: ghosts and haunting

- **Question 1 (ghosts only with 3 ships), ok:** in a 2-ship Last Afloat match the first crew out ends the match, so ghosts only play in 3-ship matches (5–6 players). Nothing added for 2-ship matches for now.
- **Question 2 (split), ok:** slice 9 is built in two halves, each with tests, a summary and a commit: **9a ghosts** (becoming one, steering it on laptop and phone, drawing it, log, time as a ghost) and **9b haunting** (zones, meters, fog, hazards set off by haunting, summary).
- **9a as proposed:** Last Afloat only. 2 s after a crew is out, its ghost appears where its ship sank (the out banner stays). It moves freely at 160 and passes through everything, kept inside the sea; it can't touch, block or be hit, and takes no packs. One ghost per crew, following the crewmate who moved it last: laptop, both crewmates steer with WASD (the gunner's mouse, clicks and E do nothing); phone, both get the stick, no buttons. Drawn for everyone as a faint dashed hull outline in the crew's colour with its symbol, pointing the way it moves, no turret. Log: `ghostStarted` (ship) and ghost positions in the once-a-second lines; summary: time as a ghost.
- **9b as proposed:** Last Afloat with hazards on. 8 zones (4 across, 2 down, 400 × 450). Each zone's hidden meter fills in proportion to the ghosts in it (one ghost: full in 20 s; two: 10 s) and drains over 60 s with none. Fog and darker water show a filling meter to everyone. A full meter sets off a hazard in that zone (kind drawn with the seed, signalled as usual, placed clear of ships); the meter empties and the zone can't fill again for 45 s; the hazard counts as the next one, so the regular timer starts its wait again. The ghost crew's top bar shows "Haunting ▮▮▮▯▯" for its current zone. Log: `hauntingTriggered` (zone, hazard, ghosts in the zone); summary: hazards set off by haunting per crew (each ghost in the zone counts it).
- **Question 3:** a) a haunted hazard may come while another is on the sea (at most 2 at once); timer hazards stay one at a time.
- **Question 4 (values), ok:** ghost appears 2 s after out; ghost speed 160; zones 4 × 2; meter full in 20 s with one ghost; drains over 60 s; zone cap 45 s.
- **Question 5:** a) a test-only server setting sinks a chosen crew at a set time (like `TEST_SINK=3@4`, Crew 3 at 0:04), on its own test server.
- **Question 6, ok:** "Haunting ▮▮▮▯▯" in the ghost crew's top bar.
- **9a built (2026-10-27):**
  - **Tuning:** `ghost` { appearAfter 2, speed 160 }.
  - **Simulation** (`sim/ghosts.ts`): the world carries `ghosts` (ship, pos, heading, appearIn). The sinking code moved out of `step()` into `sinkShip()` unchanged, plus: when a crew goes out it gets a ghost at the ship's position, appearing after 2 s (`ghostStarted`). Ghosts move at `ghost` × 160 (the crew's `ShipInput.ghost`, clamped to length 1), through everything, kept inside the sea; nothing collides with them. `sinkForTest()` sinks a ship at once (as a shot from nobody), for the TEST_SINK setting only.
  - **Input:** pilot and gunner messages take an optional `ghost` direction (validated like the stick). The room's `GhostControl` follows the crewmate who changed their direction last; while that one is still, the other's direction if they are steering. Only seated, connected crewmates count.
  - **Client:** once its ship is out, a crew's both roles send only the ghost direction: WASD on a laptop, or the touch stick (which wins when pushed); on a phone the buttons hide and the stick stays. Ghosts are drawn for everyone as a dashed hull outline in the crew's colour (line 3 px, opacity 0.85: thinner and fainter was hard to see on the water), with the crew's symbol as an outline, pointing the way they last moved, no turret or fill. `data-ghosts` for the browser tests.
  - **Room and log:** synced `ghosts` (keyed by ship id, only once appeared); `ghostStarted` (ship, crew, x, y) and `ghost` position lines once a second; the summary's Last Afloat table gains "Time as a ghost" (only for a match with a ghost).
  - **Test-only setting:** `TEST_SINK` ("crew@seconds", e.g. `3@4`); a sixth test server (port 2582, no dynamic hazards) for `e2e/ghosts.spec.ts`: Crew 3 is sunk at 0:04 in a 1-life Last Afloat match; its laptop pilot steers the ghost with D, then its phone gunner (stick only, no buttons) with the stick.
  - **Noticed and fixed (asked):** ships drew Crew 3's flag as a square (like Crew 2's), not its ▲ symbol, since Stage 1 slice 8; the user chose to fix it in this slice (ships now draw ▲, as ghosts do).
  - **Runs:** unit tests 855 plus 1 skipped. Full browser runs with the ghost test: 5 runs, 4 with one failure, always the smoke test's countdown check (it expects "3", "2" or "1"; under load the game view appeared more than 3 s after Start, so the page went straight to "Go!"). On an idle machine the countdown shows 0.5 s after Start. A run without the ghost test (4 pages, one an emulated phone) passed with peak load 15 (27–30 with it). **Answer:** run the many-page tests on their own: `playwright.config.ts` now has three groups (projects) run one after the other: "main" (20 tests, 2 at a time), then "three ships", then "ghosts". A group only runs when the one before passed (so after a failure the last two show as not run). Then `npm test` passed (855 unit plus 1 skipped, 22 browser) and 4 full browser runs in a row passed 22 of 22 (213–233 s, peak load 19–24).
- **9b built (2026-10-27):**
  - **Tuning:** `haunting` { zonesAcross 4, zonesDown 2, fillTime 20, drainTime 60, zoneCap 45 }.
  - **Simulation** (`sim/hazards.ts`): the world carries `haunting` (each zone's meter and cooldown), set for Last Afloat with hazards on (not when dynamic hazards are turned off for a test, `firstHazardAt` null). Each step, after the hazard timer: a zone in its cooldown stays empty; otherwise its meter fills by (ghosts that have appeared in it) × dt / 20, or drains by dt / 60 with none. A full meter, with fewer than 2 hazards on the sea, draws a kind with the hazard seed and a spot inside the zone (up to 60 seeded tries; the same clear-spot rules as timer hazards; a storm heads for the nearest ship); it is signalled as usual with `hauntingTriggered` (zone, hazard, the ships whose ghosts are in the zone); the meter empties, the zone's cooldown is 45 s, and the timer's wait starts again. With no clear spot the meter stays full and tries again next step. Zones are numbered row by row (`zoneOf`, `zoneRect`).
  - **Worth knowing:** with at most 3 ships, a running Last Afloat match has at most one ghost (a second crew out ends it), so "faster with more ghosts" only matters with more ships (Stage 5).
  - **Room and client:** synced `zones` (each meter) and each ghost's `zone` (from the simulation: a ghost exactly on a zone line was counted in one zone by the server and rounded into the next by the client, so its top bar showed an empty meter; found in a screenshot, fixed). As a meter fills its zone's water darkens and drifting fog puffs thicken, for everyone. A crew that is out sees "Haunting ▮▮▮▯▯" (its ghost's zone, five blocks) where its pack slots were.
  - **Log and summary:** `hauntingTriggered` lines; the Last Afloat table gains "Hazards haunted" next to "Time as a ghost" (counted for each ghost in the zone).
  - **Test server:** the ghost server (port 2582) now uses `HAZARDS_FIRST_AT=999` (haunting on, no timer hazard during the test); the ghost test also checks the ghost crew's top bar shows the meter filling while the living crews keep their pack slots. Running one file from a later test group needs `--no-deps` (otherwise the "main" group runs first).
  - **Runs:** `npm test` passed (870 unit plus 1 skipped, 22 browser), and another full browser run passed 22 of 22.

### 2026-10-27 — Stage 2 slice 10 plan: summary script additions and home-network check matches

- **Question 1:** a) the summary adds wreck-ram damage, a match-level hazard overview (per kind: how many, how many set off by haunting, how they ended; who shot krakens), and moves every hazard column out of the main per-crew table into a separate per-crew "Hazards" table (hazards on only; same numbers, printed elsewhere). Tested on a hand-made sample log of a full Stage 2 match.
- **Question 2, ok:** five check matches in Docker over the Wi-Fi, phones and laptops mixed: 1) Sink Count, packs on, hazards off, One Island; 2) Sink Count, hazards on, Random layout; 3) Last Afloat, 2 ships, 2 lives, hazards on; 4) Last Afloat, 3 ships (5–6 players), 1 life, hazards on (ghosts and haunting); 5) Last Afloat, hazards off. Fix only what blocks a full match; the rest goes to NOTES.md (watch items or Later) for the user to decide.
- **Question 3:** a) add the Stage 2 playtest notes sheet to `docs/playtest.md` in this slice (the Stage 1 combined playtest is still owed; both can run in one session).
- **Question 4:** a) part 1 (summary and playtest sheet) is built and committed first, then the check matches.
- **Part 1 built (2026-10-27):**
  - **Summary:** per crew, `wreckRamDamage` (from `wreckHit` rams' ship damage) and `krakenHits` (shots and torpedoes that hit a kraken); a match-level `hazards` overview (per kind: how many signalled, how many by haunting, ended by time, edge, grab or shot; null with hazards off). Printing: the main table keeps the Stage 0/1 columns and "Sunk by"; with hazards on a **Hazards** table follows (reef hits, wreck ram damage, wrecks destroyed, closing-storm damage, time in moving storms, whirlpool time, kraken grabs, kraken hits) and a **Hazards this match** table (kind, came, from haunting, how they ended). Existing summary tests whose column checks named the old positions now check the same figures in the Hazards table. A hand-made full Stage 2 log (3 ships, every hazard kind, a ghost that haunts) is checked figure by figure.
  - **`docs/playtest.md`:** a Stage 2 playtest section (setting up Last Afloat rounds, what players will see, a notes sheet, what the summary adds, findings to fill in).
  - **Noticed, not changed:** the summary header says "Last Afloat, 1 lives" (singular not handled).
  - **Runs:** `npm test` passed (875 unit plus 1 skipped, 22 browser).

## Later

- **(2026-10-25, Stage 5) Ship types**, discussed with the user ahead of Stage 5 (not to build before then):
  - **Five types:** Frigate, Cutter, Ironclad, Gunboat, Long gun. Settings: health, size, rate of fire, damage, gun range and energy (bar size and refill rate; boost and shield cost the same for all).
  - **Speed and turning follow size** (bigger is slower and turns slower); not a separate setting.
  - **Balance rule:** damage per second roughly equal (about 50), fine-tuned in playtesting; toughness, size, speed, range, energy and the Long gun's wider view are the trade-offs. Every type changes something for both the pilot and the gunner.
  - **Packs do fixed amounts** whatever the type (today: torpedo 50, mine 40, health 40), so they matter more against small ships.
  - **Size side effects are part of the trade:** a bigger ship reaches packs and sets off mines sooner, is easier to catch in an EMP and has less room around the island.
  - **Picking:** the pilot picks the type in the lobby **before each match** (the crew agrees off-screen); locked during the match like seats. Both crews may pick the same type; a Fleet Battle fleet may mix types.
  - **Looks:** each type has its own hull shape, plus the crew colour and symbol.
  - **Range:** a setting of its own, paid for with lower damage per second or slower speed (so a ship can't win just by keeping its distance). **Shot speed is the same for all types**, so long shots stay slow and dodgeable at their far end. A long gun may set off mines from a safe distance (shooter credited, as now). The aiming line's length shows the type's range.
  - **View:** the follow camera's view sets the longest range. **The Long gun crew's view zooms out slightly** (about 10–15%, enough for its full range plus a little margin): an exception for one ship type to "each player sees the same amount of sea" (which still holds across devices). It counts in the Long gun's balance and must be checked for readability on a small (667 px) phone.
  - **Bots** use only the Frigate at first.
  - **Timing:** stays in Stage 5; whether to move it earlier is decided after the Stage 1 playtest.
  - **Measuring:** the summary reports figures per type, and the log records the distance each hit was landed from.
  - **Visible damage (Stage 4):** shows when a ship's health drops below **25% of its own full health** (replaces "at or below one gun shot's damage").
  - **Starting values** (approved by the user):

    | Type | Health | Size | Speed | Fires every | Damage | Damage per second | Range | Energy bar | Refill per s | Notes |
    |---|---|---|---|---|---|---|---|---|---|---|
    | Frigate | 100 | 28 | 150 | 0.4 s | 20 | 50 | 600 | 100 | 5 | Today's ship |
    | Cutter | 75 | 22 | 175 | 0.3 s | 15 | 50 | 450 | 80 | 6.5 | Small bar, quick refill |
    | Ironclad | 140 | 34 | 125 | 0.6 s | 30 | 50 | 500 | 130 | 4 | Big bar, slow refill |
    | Gunboat | 80 | 26 | 155 | 0.5 s | 27 | 54 | 450 | 100 | 5 | |
    | Long gun | 85 | 30 | 145 | 0.7 s | 32 | 46 | 850 | 100 | 5 | View about 12% wider |

    Speed is about 4 points per size point from the Frigate; turning slows the same way. Hits to sink against a Frigate gun (20): Cutter 4, Gunboat 4, Frigate 5, Long gun 5, Ironclad 7.
- **(2026-10-25, Stages 2 and 5) Island layouts**, discussed with the user ahead of time (not to build before then):
  - **Layouts differ between matches**; terrain stays fixed during a match.
  - **Hand-made first:** a small set of hand-made layouts; generating layouts from the match seed is a possible later step.
  - **The host picks the layout** in the lobby, with **Random** as one option; a change applies from the next match (like the Packs toggle).
  - **Mirrored**, so neither start has an advantage (with more than 2 ships in Stage 5: rotational symmetry, to settle then). With an odd number of islands, one sits on the centre line.
  - **1–4 islands per layout**, from small rocks up to today's island size.
  - **Some channels may be too narrow for big ships** (escape routes for small types), but every pack, start and respawn spot must be reachable by every type.
  - **Each layout has its own pack, start and respawn spots**, checked automatically: open water, clear of islands, far enough apart, reachable by the biggest ship.
  - **Split across stages:** Stage 2 gets a few fixed, mirrored layouts, designed together with reefs and wrecks (all ships are Frigates then, so "biggest ship" means the Frigate). Stage 5 gets layouts that scale with map size and the number of ships, and the checks against the bigger ship types.
  - **Today's single-island map stays the default layout**, so the Stage 0 reference recording still holds with packs off.
  - **Logging:** each match's start line records its layout; the summary header shows it (like Packs on/off).
- **(2026-10-25, Stage 4 or earlier) Countdown beeps**, discussed with the user ahead of time (not to build yet):
  - **When:** a double beep at 1:00 left; then one beep per second over the last 10 seconds, higher-pitched for the last 3 (0:03–0:01), and a horn at 0:00.
  - **Start and resume countdowns** beep too: 3, 2, 1, then a higher beep for "Go!".
  - **Every device beeps**, each with its own sound switch: a small speaker icon in the top bar (mind the 667 px watch item), **on by default**, remembered per device across matches and reloads.
  - **Paused:** the beeps stop during a pause and pick up again after the resume countdown.
  - **Sound:** simple tones generated by the browser (no files, no new library); Stage 4 decides whether to replace or keep them.
  - **No vibration** for the countdown; sound is enough.
  - Practical points to check when built: phones play sound only after a tap (the first tap already goes fullscreen); an iPhone's ring switch may silence browser sound; devices are up to about 100 ms apart.
  - **Stage:** stays with Stage 4's sound unless the Stage 1 playtest shows players kept checking the clock; decide after the playtest.
- **(2026-10-25, stage not set) "Add to Home Screen" (web app manifest)**, so the game opens from a home-screen icon without the browser's address bar. No page can go fullscreen by itself; every browser needs a tap first (Android already goes fullscreen and locks sideways on the first tap). On iPhone, web pages still can't go fullscreen (only videos can; WebKit bug 206854, nothing new in the Safari 27 beta as of mid-2026). A manifest (one small file, no library) would give: **Android** true fullscreen, locked sideways; **iPhone** Safari's bars hidden, but the status bar may stay and the sideways setting is ignored, so "Rotate your phone" stays. Recheck iPhone support when it's built.
- **(2026-10-27, stage not set) QR code for joining from a phone**, asked for by the user (not to build yet): the room screen shows a QR code that a phone scans to open the game with the room code filled in, instead of typing the laptop's address and the code. Points to settle when it's planned:
  - **The address in the code:** the laptop's Wi-Fi address (today found with `hostname -I`). A page opened as `localhost` on the laptop doesn't know it, and the server inside Docker sees only its container address, so it probably needs a setting in `compose.yaml` (or a way to type the address once).
  - **The room code in the link** (for example `http://<address>:2567/?code=ABCD`): the join screen would fill it in, so the phone only needs a name.
  - **Drawing the QR code:** either a small library (a new dependency, so ask first, with the reason) or a hand-written encoder.
  - **Fits Stage 3** ("can a group get playing within 30 seconds?"), unless wanted earlier, for example for the Stage 2 check matches and playtests.
