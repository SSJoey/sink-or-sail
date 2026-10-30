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

### 2026-10-27 — Stage 2 wrap-up deferred; Stage 3 planning starts

- **Deferred, still owed (user's choice):** Stage 2 slice 10 part 2 (the five home-network check matches) and the Stage 2 playtest (`docs/playtest.md`), like the Stage 1 combined playtest. Stage 2's definition of done items 1 and 5 stay open; they can be run any time, for example alongside Stage 3 testing.
- **Stage 3 planning starts:** Claude drafts the plan from `docs/design.md`; nothing is built until the user approves it.

### 2026-10-27 — Stage 3 planning (full lobby)

Drafted from `docs/design.md` and the lobby mock-ups on the look-options canvas (Join, Crew and role, Host settings, Waiting; Fleets is Stage 5). Scope: lobby screens, changing your name, the QR code, the waiting screen for late joiners, bots (partner and whole ships), results and awards with Play again / Back to lobby, spectator view, a simple lifebar, log and summary additions. Out: Fleet Battle, map size, more than 3 ships (Stage 5); sea-chart art, sound, cloud hosting, the spectator delay (Stage 4).

- **Question 1 (lobby model):** a) switch to the mock-ups' **crew-based model**: your crew gets a colour automatically; you pick Pilot or Gunner; then Find me a partner, join a crew from the room's list, or Play with a bot (instead of today's seat grid).
- **Question 2 (look):** a) the mock-ups' layout and flow now, in today's plain style; the sea-chart look comes with Stage 4's art.
- **Question 3:** a) a **Ready** button per crew, and "x of y crews ready" for the host; the host can still start without everyone ready.
- **Question 4:** yes, the **QR code** moves into Stage 3 (slice 1).
- **Question 5:** a) **all 17 awards**. Still to settle in the awards slice's plan: what "Storm Chaser" counts (closing storm, moving storms, or both) and the speed below which a ship counts as standing still for "Sitting Duck".
- **Question 6:** a) **partner bots, then bot ships**, in both modes; bots steer round islands, reefs and hazards and use packs; bot crews don't become ghosts.
- **Question 7, ok:** the spectator view is live (no delay until online play in Stage 4), shown on its own laptop or TV.
- **Question 8, ok:** a thin lifebar above every ship (green, amber, red), the same for everyone.
- **Question 9, ok:** done includes a Stage 3 playtest timing how long a fresh group takes from opening the page to playing (target 30 s), plus the usual tests.
- **Question 10, ok (slice order):** 1 changing your name and the QR code; 2 the new lobby screens and crew pairing (with Ready); 3 the waiting screen and late joiners; 4 the lifebar; 5 results screen, Play again, back to the lobby; 6 awards; 7 spectator view; 8 partner bots (bot gunner and bot pilot); 9 bot ships; 10 log and summary additions, then check matches.

### 2026-10-27 — Stage 3 slice 1 plan: changing your name and the QR code

- **Plan as proposed:** the room screen shows "Your name: …" with **Change** (field, Save, Cancel); the server accepts a change only between matches (not during the countdown, a match or a pause), with the join rule (1–12 characters); everyone sees it at once; nothing is logged (the next match's start line has the names). The room screen shows a QR code beside the room code ("Scan to join") holding a link like `http://192.168.1.11:2567/?code=7QX4`; opening it fills in the room code on the join screen.
- **Question 1 (library):** a) add **`qrcode-generator` 2.0.4** (MIT, no dependencies of its own, client only): encoding QR codes correctly is a few hundred lines of fiddly code.
- **Question 2 (address in the QR code):** c) the page's own address when it isn't `localhost`; otherwise the laptop's address passed in by Docker at start (a longer start command, `HOST_IP` from `hostname -I`); with neither, a hint instead of the QR code.
- **Question 3:** a) everyone in the room sees the QR code.
- **Question 4 (names):** **names must be unique in a room**, on joining and on changing. (Detail chosen while planning, to confirm: compared ignoring upper/lower case, so "Ana" and "ana" count as the same.)
- **Question 5:** a) the device remembers your name and fills it in on your next visit.
- **Confirmed by the user:** names are compared ignoring upper/lower case. (Unique names on joining already existed this way since Stage 0; the slice adds the same rule to changing your name, with the same message, "That name is already in this room.")
- **Built (2026-10-27):**
  - **Dependency:** `qrcode-generator` 2.0.4 (exact pin, client only).
  - **Name change:** `ClientMessage.SetName` { name }; refusals `nameLocked` (countdown, match or pause), `invalidName`, `nameTaken` (another player's name, any case; a player may change the case of their own). Room screen: "Your name: …" with Change (field, Save, Cancel); hidden during a match.
  - **QR code:** `JOIN_ADDRESS` (server setting: an IPv4 address or plain host name, else ignored) is synced as `joinAddress`. `client/src/lobby/joinLink.ts`: the page's own address unless it is localhost (`localhost`, `127.*`, `::1`), then `JOIN_ADDRESS` on the same port, else none; the link is `<address>/?code=ABCD`, and the join screen reads `?code=` (a bad code is ignored) and puts the cursor in the name field. The room screen draws the QR code (error correction level M) beside the room code, "Scan to join", for everyone; with no address it shows a hint ("Phones can't open localhost: open this page at the laptop's Wi-Fi address (hostname -I) to show a QR code here.").
  - **Docker:** `compose.yaml` passes `JOIN_ADDRESS: ${HOST_IP:-}`; start with `sudo HOST_IP=$(hostname -I | cut -d' ' -f1) docker compose up --build -d` (in `docs/playtest.md`; not yet tried on the laptop: sudo can't run from here).
  - **Remembered name:** `client/src/lobby/rememberedName.ts` (localStorage, quietly skipped when storage is missing or refuses); saved whenever your name in a room is set or changed.
  - **Test server:** port 2577 has `JOIN_ADDRESS=192.0.2.10` (a documentation-only address) for `e2e/lobby.spec.ts`.
  - **Runs:** `npm test` passed (891 unit plus 1 skipped, 25 browser).

### 2026-10-27 — Stage 3 slice 2 plan: the new lobby screens and crew pairing

- **Plan as proposed:** every player is always in a crew; the seat grid goes. Room screen (plain style, the mock-ups' layout): your crew (colour and symbol assigned automatically, Pilot / Gunner buttons with who has each, Find me a partner; Play with a bot comes in slice 8), the crews in the room (colour, players, Ready / Not ready / "Needs a gunner" with Join), a Ready button, and host settings below (host only; others see them as text). Rules: you can switch to your crew's free role; Join moves you into that crew's free role (an emptied crew closes); Find me a partner moves you into the crew waiting longest (if none, the next player to join pairs with you); one ship per crew (2 or 3; a one-player crew sails with the other role empty until bots); crews locked during a match (late joiners: slice 3).
- **Question 1:** a) **auto-pairing on joining**: a joiner goes into the crew waiting longest for a partner (its free role); if none is waiting, a new crew of their own as pilot.
- **Question 2:** a) **Ready is each player's own**; a crew is ready when all its players are; moving crew or role clears your Ready; everyone's clears at each match start. The host sees "x of y crews ready" and can start anyway.
- **Question 3:** a) **crew numbers close up between matches**, so the ships are always Crew 1, 2 (and 3) in order; a crew's colour may change before a match, shown on screen.
- **Question 4:** a) the seat grid is removed; every browser test seats players through the new screens with a shared helper (checking the same things).
- **Question 5 ("Start my own crew" wording):** no. Follow-up: the button is **"Leave this crew"** (same action: you go to a new crew of your own, when there are fewer than 3 crews).
- **Built (2026-10-27):**
  - **Server** (`server/src/rooms/crews.ts`, plain functions): `placeJoiner` (into the crew waiting longest, its free role; else a new crew as pilot; during a match only a waiting crew that has a ship, else no crew until it ends), `findPartner`, `leaveCrew` (keeps your role), `closeUpCrews` (renumbers crews in order, between matches), `refreshWaiting` (a crew with one player waits from then; ties: lower crew first), `crewsReady`. The room applies them on joining, leaving, every crew move and at the match end (players without a crew get one then). Switching role and Join use the existing TakeSeat (taking the free seat in your crew, or another crew's). New messages `findPartner`, `leaveCrew`, `setReady` { ready }; refusals `noPartnerWaiting`, `alreadyPaired`, `noFreeCrew`, `alreadyAlone`. Players carry `ready` (cleared on a crew or role change and at each match start). **LeaveSeat is gone** (replaced by Leave this crew).
  - **Client:** the seat grid, Leave seat and "Not seated" are gone (`seatButtons.ts` removed). The room screen shows your crew (its colour and symbol, Pilot / Gunner buttons with who holds each, Find me a partner when alone, Leave this crew when paired and fewer than 3 crews), the crews in the room (`crewList.ts`: colour, players pilot first with ★ host / (you) / (reconnecting), Ready / Not ready / "Needs a …" and "Join as …"), Ready (✓ when pressed) and, for the host, "x of y crews ready". During a match crews are locked; a player without a crew sees "A match is under way: you'll get a crew when it ends." and can Join a crew with a free seat. Taken role buttons stay readable (found in a screenshot: the disabled look washed them out).
  - **Tests changed (the seat model changed as agreed):** server tests that assumed a joiner starts without a seat now expect the pairing (the match tests' unseated "watcher" became a third player in Crew 2; tests that need a player without a crew now join one mid-match once every crew with a ship is full); the four `leaveSeat` unit tests and the room's two Leave seat tests became Leave this crew tests; the seat-button unit tests went with the grid (replaced by `crewList.test.ts`). Browser tests seat players with `seatAs()` (Join, Leave this crew, role buttons; `data-crew` / `data-role` on `#my-crew`); the smoke test's Leave seat case became a crew case (role switch, pairing, Leave this crew, Find me a partner, Ready); the 3-ship test's second player starts Crew 3; the ghost test's steering crew is Crew 2 (TEST_SINK now `2@4`); the wreck test gains a host sitting in Crew 1 so the shooting crew is still Crew 2.
  - **Runs:** `npm test` passed its 907 unit tests (plus 1 skipped) with one browser failure (the phone torpedo pack test, a known load failure; it passed alone), then two full browser runs passed 25 of 25.


### 2026-10-27 — Stage 3 slice 3 plan: the waiting screen and late joiners

- **Plan as proposed:** a player who joins while a match is on sees the waiting screen (from the mock-up): "A match is under way", "You'll join at the start of the next round. Set up your crew while you wait."; three figures (ships afloat; time left in Sink Count or the storm timer in Last Afloat; others waiting); "Your crew for the next round" (choose Pilot / Gunner; who you're with); "Pair with <name>" for each other waiting player without a partner (Play with a bot comes in slice 8); "Your crew colour is assigned when the round starts"; Leave room. When the match ends, a waiting pair starts a new crew together if there are fewer than 3 crews (else each fills a crew waiting for a partner), and a single waiting player is placed like a joiner, in their chosen role where it's free. Waiting players count toward the room's 6.
- **Question 1:** a) **late joiners always wait for the next round** (as `docs/design.md` says): slice 2's pairing of a mid-match joiner into a crew with a ship goes.
- **Question 2:** a) the waiting screen, with a **Watch the match** button showing the live game until they go back (until the spectator view in slice 7).
- **Question 3, ok:** "Pair with …" pairs at once (no accepting, like Join); either player unpairs by choosing another partner or with **Wait alone**.
- **Question 4, ok:** the three figures as proposed.
- **Built (2026-10-27):**
  - **Server:** a player who joins during a match always waits without a crew (`placeJoiner` with `matchOn`); nobody changes seat during a match (`canChangeSeat` now locks seatless players too). Waiting players carry `nextRole` (default pilot) and `partner`; messages `setNextRole` { role } and `pairWith` { player } ("" = Wait alone; only another waiting player without a partner; pairing replaces any earlier partner; leaving the room unpairs). At the match end `seatWaiting` places them in join order: a pair who chose each other starts a new crew (the first in their chosen role) if there are fewer than 3 crews, else each is placed like a joiner; a single player is placed like a joiner (their chosen role when starting a crew); partners are then forgotten.
  - **Client:** the waiting section (`lobby/waiting.ts`: ships afloat; time left, or in Last Afloat with the storm "until the storm" then "Closing" / "Closed"; others waiting; Pilot / Gunner; "Paired with …" or "Looking for a partner"; "Pair with …" buttons; Wait alone; Watch the match). The game view opens for a waiting player only when watching; a **Back** button in the top bar (players without a seat) returns to the waiting screen.
  - **Tests changed (late joiners now wait, as agreed):** the room tests' mid-match joiner (who used to be paired into a crew with a ship, or take a freed seat) now waits and is refused a seat (SeatLocked); the Crew 3 test now ends with the waiting player paired into the crew waiting for a partner; the log test checks no `seatTaken` line is written for a late joiner; `canChangeSeat`'s seatless-player tests now expect a lock; the slice 2 pairing test for mid-match joiners now expects waiting. New: pairing rules, the waiting room messages, the waiting view, and `e2e/waiting.spec.ts`.
  - **Runs:** `npm test` passed (918 unit plus 1 skipped, 26 browser).

### 2026-10-27 — Stage 3 slice 4 plan: the lifebar

- **Plan as proposed:** a bar above every ship afloat (yours too), level whatever the ship's heading, with a dark backing for the missing part; hidden for sunk ships and ships hidden in a moving storm (from other crews); fades with a sinking ship and blinks with a protected one; ghosts have none; follows the ship's blended health.
- **Question 1:** a) green above 50%, amber 25–50%, red below 25% (25% matches Stage 4's visible damage).
- **Question 2:** a) 48 × 6 sea units, 40 above the ship's centre (about 27 × 3.5 px on a 915 px phone).
- **Question 3:** a) your own ship's bar is the same as everyone else's (no number in the top bar).
- **Built (2026-10-27):** `TUNING.client` lifebarWidth 48, lifebarHeight 6, lifebarOffset 40, lifebarAmberAtOrBelow 0.5, lifebarRedBelow 0.25; `client/src/game/lifebar.ts` (fill, colour, shown). Drawn with the ship (so it blinks with protection and fades with a sinking ship), over a dark backing; colours green 0x7ee081, amber 0xffb347, red 0xff4d4d; skipped for another crew's ship hidden in a moving storm. `data-lifebars` for the browser test (`e2e/lifebar.spec.ts`: Crew 1 sails onto a reef and both pages see its bar at 0.95). On a 915 px phone the bars are small (about 27 × 3.5 px) but readable in a screenshot. `npm test` passed (921 unit plus 1 skipped, 27 browser).

### 2026-10-27 — Stage 3 slice 5 plan: results screen, Play again, back to the lobby

- **Plan as proposed, all ok:** a winner banner and a results table (Place, Crew with symbol, colour and names, Sinkings, Time afloat; Last Afloat adds Lives left or "out"), worked out by the server at the match end and synced. **Play again** (host only) starts the next match at once (3-2-1) with the same crews and settings (players who waited are already placed; Ready doesn't hold it up); others see "Waiting for the host to play again". **Back to lobby** (everyone) closes the results; everyone goes back automatically 20 s after the match ends ("Back to the lobby in 15"). The room screen keeps its short last-match result. Room left for awards (slice 6).
- **Places:** Sink Count by sinkings (most first; equal sinkings share a place); Last Afloat: the winner first, then crews in the order they went out (later = higher); at the time limit crews still in are ranked by lives left, then health (as the winner rule).
- **Time afloat:** time on the water, not counting respawn waits; in Last Afloat until the crew is out (as the summary script counts it).
- **Built (2026-10-27):**
  - **Shared** (`sim/results.ts`): `matchPlaces` (Sink Count by sinkings; Last Afloat crews still in by lives left then health, then crews out by when they went out, later higher; equal shares) and `shipResults` (place, sinkings, whole seconds afloat, lives left, out).
  - **Server:** the room tallies each ship's time on the water (each running tick it isn't sunk) and when each crew went out, and at the match end (time, last afloat, or ended early) fills the synced `results` (cleared when a match starts).
  - **Client:** the end-of-match view shows the winner, a table (Place, Crew "● Crew 1 · Ana & Ben", Sinkings, Time afloat m:ss, Lives left or "out" in Last Afloat) and the layout; **Play again** for the host (sends Start), "Waiting for the host to play again" for others; **Back to lobby** (was "Back to room"); "Back to the lobby in N", closing by itself after `TUNING.client.resultsSeconds` (20). The room screen's last-match result uses the same table.
  - **Tests changed:** the Last Afloat browser test checks the same facts (places, crews, sinkings, lives) in the table instead of the old one-line scoreboard. `scoreRows` and `resultLine` are no longer used by the game (kept, with their tests, for now).
  - **Runs:** `npm test` passed (929 unit plus 1 skipped, 28 browser).

### 2026-10-27 — Stage 3 slice 6 plan: awards

- **Plan as proposed:** the server tallies during the match (from the simulation's events and ship states), works out at the end which crews earned which awards, and picks among them at random with the match's seed, at most one per crew and at most 4. Shown under the results table ("**Sharpshooter** · ■ Crew 2 · most hits (7)"), and in the room screen's last match; an `awards` line in the match log and in the summary.
- **Question 1, ok:** with today's 2 or 3 ships, "at most one per crew" means at most 2 or 3 awards a match (more with more ships in Stage 5).
- **Question 2 (ties):** a) a tied award goes to nobody; **the tied crews get their next award they earned instead** (the one-per-crew pick moves on to their other awards).
- **Question 3 ("Storm Chaser"):** a) time in the closing storm (outside its circle) plus time in moving storms, for a crew never sunk by the closing storm.
- **Question 4, ok:** "Sitting Duck" counts time afloat below speed 15 (a tenth of top speed).
- **Question 5, ok (definitions and minimums):** Untouchable: fewest hits taken (shots, torpedoes, mine blasts, bumps that hurt), afloat at the end. Sharpshooter: most hits landed (shots and torpedoes), 3+. Kraken's Favourite: most kraken grabs, 1+. Ghost of the Match: most hazards set off by haunting, 1+. Mine, All Mine: sunk by its own mine, 1+. Davy Jones' Express: the first ship sunk. Rock Collector: most reef hits, 2+. Bumper Boats: most bumps with other ships, 3+. Sitting Duck: most time stationary, 20 s+. Trigger Happy: most shots fired and also the worst accuracy, 10+ shots. Pack Rat: most packs picked up, 2+. Hoarder: longest time holding one pack without using it, 30 s+. Shield Hog: most energy on the shield, 50+. Speed Demon: most energy on boost, 50+. Close Shave: afloat at the end with the least health, below 25%. Storm Chaser: most storm time without being sunk by the closing storm, 10 s+. Whirlpool Tourist: most time in whirlpools, 5 s+.
- **Built (2026-10-28):**
  - **Shared** (`sim/awards.ts`): `newTally` / `updateTally` (from each step's events and the world after it: hits landed (shots and torpedoes) and taken (shots, torpedoes, mine blasts and bumps that did damage), shots, gun hits, bumps, reef hits, kraken grabs, packs picked up, hazards haunted, own-mine sinkings, the first ship sunk, sinkings by the closing storm; seconds afloat below speed 15, in a storm (outside the closing circle once it closes, or in an active moving storm) and in an active whirlpool's reach; the longest any one pack was held, pickup to use or loss) and `closeTally` (packs still held count to the end). `earnedAwards` applies the agreed rules (a tie goes to nobody; Untouchable and Close Shave only for crews afloat and not out at the end; Trigger Happy needs the most shots and strictly the worst gun accuracy of the crews that fired; Hoarder counts the longest hold of any pack). `pickAwards` shuffles with the match seed and takes awards in that order, at most one per crew and at most `awards.maxPerMatch` (4). `TUNING.awards` holds the minimums.
  - **Server:** the room tallies each running tick and, at the match end, syncs `awards` (award, ship, detail) and logs an `awards` line (award, ship, crew, detail) just before `matchEnd`. The summary reads it and prints "Awards: Sharpshooter (Crew 2, most hits (7)) · …" under the header.
  - **Client:** the results show each award under the table: "**Sharpshooter** · ■ Crew 2 · most hits (7)" (also in the room screen's last match).
  - **Browser test:** `e2e/results.spec.ts` now boosts for 2.5 s first and checks Speed Demon shows; it waits for the match clock to run (the countdown's "hidden" can be true before it appears).
  - **Runs:** `npm test` passed (944 unit plus 1 skipped, 28 browser).

### 2026-10-27 — Pack icons (plan change, asked for by the user before awards)

Pack icons are art (Stage 4's "sea-chart art"); the user asked to bring them forward.

- **Question 1 (when):** a) **a short extra slice now, before awards**: Stage 3's slices become 1–5 as built, **6 pack icons**, 7 awards, 8 spectator view, 9 partner bots, 10 bot ships, 11 log and summary additions then check matches.
- **Question 2 (where):** a) on the sea, in the top bar ("Packs: [mine] · [torpedo]") and on the phone's Pack button next to the name.
- **Question 3 (pictures):** mine a round sea mine with spikes; torpedo from the side with fins and propeller; **EMP just a lightning bolt**; health a first-aid cross.
- **Question 4:** a) keep the different outline shapes on the sea (circle, capsule, diamond, square) with the icon inside, and drop the letters; **the pack's name shows on hover on laptops**.
- **Question 5:** a) our own simple SVG icons, one set for the sea (Phaser loads SVGs as images) and the page; no new dependency.
- **Question 6:** a) keep today's single dark fill; the icons carry the difference.
- **Follow-up (hover on the sea):** b) no; the sea shows icons only, names are on hover in the top bar.
- **Built (2026-10-27):**
  - **Icons:** four white 24 × 24 SVGs in `client/public/icons/packs/` (mine: round, spiked; torpedo: side view, fins and propeller; EMP: a lightning bolt; health: a first-aid cross), listed in `client/src/game/packIcons.ts`. They are plain files, not imported: Vite inlined them as data URLs, which Phaser's SVG loader couldn't read (the scene failed to load and every pack test failed; found at once and fixed).
  - **Sea:** the scene loads the SVGs (drawn at 96 px, shown at 1.6 × the pack radius) and shows the icon inside each pack's outline shape instead of the letter; icons under a moving storm are hidden, as the letters were.
  - **Top bar:** "Packs:" then the two slot icons ("—" when empty), with `aria-label` / `title` "Packs: Mine · —" and each icon's name as its alt and hover text. `packSlotText` (letters) became `packSlotLabel` (names); its unit test checks the names. A ghost crew's haunting meter still shows as text there.
  - **Phone Pack button:** the icon above the name ("Pack" with nothing loaded).
  - **Tests changed:** the browser tests' 17 top-bar checks now read its label ("Packs: Mine · —") instead of the letters ("Packs: M · —"); the laptop and phone mine tests also check the icon and its hover name. The wreck test now waits for Crew 2 to show on the gunner's page before joining it (a race in `seatAs`, seen once).
  - **Runs:** `npm test` passed (929 unit plus 1 skipped, 28 browser).

### 2026-10-28 — A home match analysed (VVGW, 2026-10-27 22:25)

- 4 players, Sink Count, packs on, hazards off, One Island, full 4:00 (a build from before the lifebar). Crew 1 (Joey & Melissa) won 8–0; Crew 2 (Ian & DI) was sunk every 20–40 s.
- **Crew 2's gunner (DI, a child on a phone) fired 2 shots in 4 minutes, never shielded and never used a pack** (two torpedoes and an EMP picked up, two lost on sinking). No drops or reconnects; DI reported no problem, so most likely unfamiliarity with the gunner's phone controls rather than a fault. Crew 2's pilot boosted almost constantly (885 energy, bar empty 74 s).
- Crew 1 used every pack (mine, torpedo, 3 EMPs, 2 health); Melissa fired 321 shots (14% hit).
- The two later logs that evening were solo tests; the hazards one (VHBU) showed reefs, a wreck ram, a moving storm, a kraken grab and health packs working. No awards there: that build was from before slice 7.

### 2026-10-28 — Stage 3 slice 8 plan: spectator view

- **Question 1:** a) **Watch** on the join screen (a TV or laptop), plus **Watch instead** on the room screen for any player between matches (the host too; it frees their seat and crews close up) and **Play next round** for a spectator (joins as a player, paired in like a joiner).
- **Question 2:** a) up to **6 players plus up to 4 spectators**.
- **Question 3:** a) ships hidden in a moving storm stay hidden on the spectator view (everyone in the room can see a TV).
- **Question 4, ok:** the spectator lobby shows the room code and QR code large with "Join on your phone", the crews and Ready, and Play next round. During a match: the whole sea, no controls or aiming guide; a top bar with mode, score or lives, clock and storm status; fog and the closing storm as usual. After a match: the results and awards.
- **Question 5, ok:** spectators can't pause; a spectator host keeps the host's controls (settings, Start, Play again, Pause / Resume, Exit).
- Logged: spectators' joins and leaves with role "spectator".
- **Built (2026-10-28):**
  - **Shared:** `MAX_SPECTATORS` 4; messages `watch` and `playNextRound`; join error `roomFull` (6 players, spectators not counted) and `spectatorsFull`; refusal `roomFull` (Play next round with 6 players).
  - **Server:** players carry `spectator`; a room takes `MAX_PLAYERS + MAX_SPECTATORS` connections, and the join check keeps each within its limit (a 7th player now gets `roomFull` rather than a locked room; the two room-full tests now expect that). Joining with `watch: true` gives no crew. Watch instead (between matches; refused during one) frees the seat and crews close up; the host stays host. Play next round: placed like a joiner (waits during a match). Spectators can't take seats, find partners, leave crews or set up a next round; they're left out when waiting players are placed. A host who only watches can pause (and, as host, resume and end). Log lines for spectators' joins, drops, reconnects and leaves have role "spectator".
  - **Client:** Watch on the join screen; on the room screen, "You're watching. Join on your phone: …", a large QR code (260 px) and room code, the crews (no Join buttons for a spectator: found in a screenshot and closed on the server too), Play next round, and Watch instead for players between matches. During a match a spectator sees the whole sea with the top bar "Watching · Sink Count" (or Last Afloat), score, clock and storm status, no controls, and Play next round (then the waiting screen). Ships hidden in a moving storm stay hidden.
  - **Runs:** `npm test` passed (954 unit plus 1 skipped, 29 browser).

### 2026-10-29 — Stage 3 slice 9 plan: partner bots

- **What it builds:** **Play with a bot** on your crew panel when you're alone: a bot takes the crew's free role; the crew list shows "Ana & Bot"; a bot is always Ready. Bots run on the server: each tick their controls are worked out from the match state, like a player's input, with a small aiming wobble from the match seed (same seed, same bot). Whole bot ships are slice 10.
  - **Bot gunner:** aims at the nearest enemy it can see, leading it a little, with some wobble; fires when in range and the island isn't in the way; raises the shield for about a second after a hit, if there's energy; fires a torpedo when an enemy is nearly dead ahead and in range; fires an EMP when an enemy is within its ring.
  - **Bot pilot:** heads for a pack it can use; otherwise closes to fighting distance from the nearest enemy and circles; steers round islands, wrecks and reefs by looking a short way ahead; keeps out of whirlpools and away from the kraken; stays inside the closing storm's circle; boosts to escape; drops a mine when an enemy is close behind.
- **Question 1:** a) **Play with a bot** on the waiting screen too, for the next round, as in the mock-up.
- **Question 2:** a) between matches a joiner is paired into a crew with a bot first and the bot leaves; during a match the joiner waits and takes over at the next round; plus a **Remove bot** button (the crew goes back to waiting for a partner).
- **Question 3, ok:** starting values in `tuning.ts`: a bot rethinks every 0.3 s (its reaction time); aim wobble up to ±6°; fires when aimed within 5° of the target and within 550 (of the gun's 600); shield 1 s after a hit, if energy is 30 or more; torpedo when an enemy is within 12° of the bow and 500 away; EMP when an enemy is within 180; fighting distance 350, detouring up to 500 for a pack; look-ahead for obstacles 120; mine when an enemy is within 150 behind.
- **Question 4:** a) bots don't see ships hidden in a moving storm either.
- **Question 5, ok:** bots don't count toward the 6-player limit (with 3 crews there are still at most 6 seats).
- Logged: bots named "Bot" in the log.
- **Chosen while building (to confirm):**
  - **A joiner takes a bot's place before a crew waiting for a partner** (reading "pair into a crew with a bot first" literally). So a player alone and waiting stays alone if there is also a crew with a bot; they can press Play with a bot themselves.
  - **A bot never stays without a player:** when its player leaves the room, presses Leave this crew or Watch instead, the bot goes too (also during a match: that ship then has nobody aboard, as when a crew leaves today).
  - **Extra values** in `tuning.ts` (`bots`), not in the approved table:
    - the pilot runs at 30% health or less with an enemy within 250, boosting if energy is 30 or more (also when getting away from a whirlpool or the kraken);
    - it keeps 60 outside a whirlpool's reach and 250 from the kraken;
    - it stays 80 inside the closing storm's circle as it will be 5 s ahead.
  - **How the pilot steers round things:**
    - it keeps 12 between its hull and an island or wreck on the way ahead;
    - it takes turns sharper than 60° at 40% speed, so it doesn't drift wide;
    - against an island, it stops pressing into it.
  - **What the bots see:** they ignore ships hidden in an active or fading moving storm. The torpedo also waits for a clear line (no island or wreck in the way).
- **Built (2026-10-29):**
  - **Shared:**
    - `sim/bots.ts`: `newBotMind` (seeded from the match seed, ship and role), `botGunner`, `botPilot`, `visibleEnemies`;
    - `TUNING.bots`;
    - messages `playWithBot` and `removeBot`; refusal `noBot`.
  - **Server:**
    - Bots sit in the room's players under ids like `bot:1`, named "Bot", always ready, with `bot: true`. They don't hold a name or count toward the 6 players.
    - `crews.ts`: `addBot` and `removeBot`. A lone bot leaves. A joiner takes a bot's place. A waiting player who chose Play with a bot gets a new crew with one when the match ends (`withBot` on the player, cleared by pairing with someone). Bots count as ready.
    - Each tick the room works out each bot's controls with its own mind, reset at every match start.
    - The log's crews name bots "Bot".
  - **Client:**
    - Play with a bot and Remove bot on your crew panel between matches;
    - Play with a bot and Remove bot on the waiting screen, showing "Playing with a bot";
    - the crew list shows "Ana & Bot".
  - **Measured:** in 2-minute all-bot matches with 3 ships, packs and hazards on, on every layout with two seeds, the ships came up against an island 3–21 times per match (Slalom's small rocks the most), each time for well under 2 s. A 4-minute bot match has dozens of shots and hits, sinkings and packs used.
  - **Tests:**
    - `sim/bots.test.ts` (22): aim, lead, firing rules, cover, hidden ships, shield, torpedo, EMP, packs, fighting distance, look-ahead, reefs, whirlpool, kraken, storm, running away, mine, island scrapes on every layout, a fight, the same seed giving the same match.
    - Crew tests (9 new).
    - `CrewRoom.bots.test.ts` (12).
    - Client crew list and waiting screen (2 new).
    - Browser `e2e/bots.spec.ts`: a solo laptop pilot plays with a bot gunner, which hits the other ship.
    - Two room tests that compare a whole player now include the new `bot` and `withBot` fields.
  - **Runs:** type-check clean; `npm run test:unit` passed (999 plus 1 skipped). Browser: none of 4 full runs was clean, each with 1 load failure in a test that doesn't use bots (the first smoke test three times, a phone test once). All of them pass on their own. Without the new bot test, the 27 "main" tests passed. The user chose to commit as it is (2026-10-29); it's added to the load watch item in CLAUDE.md.

### 2026-10-29 — Stage 3 slice 10 plan: bot ships

- **What it builds:** a host **Bot ships** setting (between matches). Bot ships are crews of two bots, always ready, shown after the players' crews ("▲ Crew 3: Bot & Bot (bot ship)"). Ships at the start: the players' crews plus bot ships, at least 2 and at most 3. Bot ships play like partner bots (same pilot, gunner and values; no new numbers). They take places in the results and can win, shown as "Crew 3 (bots)". The match start log names their seats "Bot" (the rest of the log and summary is slice 11).
- **Question 1:** a) a **Bot ships** dropdown (0, 1, 2) next to the other host settings.
- **Question 2:** a) the players' crews come first: a bot ship gives way to a new crew, and the setting shows how many fit ("Bot ships: 2 (1 fits)").
- **Question 3:** a) a match can start with bots only (e.g. a host who only watches 2 bot ships on the TV).
- **Question 4:** b) only crews with a player get awards.
- **Question 5, ok:** with one players' crew and no bot ships, the second ship still sails empty, as now.
- Last Afloat (from the scope): a bot crew that is out stays out, with no ghost and no haunting.
- **Chosen while building (to confirm):**
  - **The host's setting stays as chosen** when fewer fit. With room again (say a crew leaves), the bot ships come back.
  - **During a match bot ships stay as they are,** and the host's dropdown is locked, like the other settings.
  - **Shown in the lobby** as "Bot & Bot (bot ship)", always Ready, and counted in "x of y crews ready".
  - **Others see** "Bot ships: none / 1 / 2", plus "(1 fits)" or "(none fit)" when fewer fit. The host sees that note next to the dropdown only when fewer fit.
- **Built (2026-10-29):**
  - **Shared:** `MAX_BOT_SHIPS` 2; message `setBotShips` { count }; the world's `botShips` (no ghost for them); `pickAwards` leaves bot ships out without changing the other crews' picks.
  - **Server:**
    - room setting `botShips`; `readBotShips`;
    - `crews.ts`: `withoutBotShips` and `fillBotShips`. Bot ships' bots have ids `botship:<n>:<role>` and are left out while crews are paired, then fill the free crews after the players' crews (between matches). Their seats are taken, so a player can't sit in one.
    - the match is told which ships are bot ships, and they get no awards.
  - **Client:** the host's Bot ships dropdown with the status text; the crew list shows bot ships; results show "Crew 3 (bots)".
  - **Tests:**
    - ghosts and awards (2 new);
    - crews (2 new); `readBotShips`;
    - room (6 new: the setting, giving way, starting with them and in Last Afloat, bots only, locked during a match, their seats taken);
    - client: setting text, crew list, results (3 new);
    - browser: the host adds a bot ship, which fires.
  - **Runs:** type-check clean; unit 1013 passed (plus 1 skipped); one full browser run, 31 of 31 passed (peak load 17).

### 2026-10-29 — Stage 3 slice 11 plan: log and summary additions, then check matches

The user agreed to every suggestion.

- **Part 1 (log, summary, playtest sheet):**
  - **Log, `matchStart`:**
    - bot crew members are marked `bot: true`;
    - each crew gets `botShip: true/false`;
    - the host's Bot ships setting and how many fit;
    - the names of the spectators watching;
    - how many players are waiting for the next round.
  - **Log, during the match:** a `playNextRound` line when a spectator or a waiting player asks to join the next round.
  - **Summary:**
    - the header adds "Bot ships: …" and "Spectators: …";
    - bots show as "Ana & Bot", and a bot ship's crew as "Bots (bot ship)";
    - the awards line stays as it is;
    - a hand-made sample log is checked figure by figure.
  - **`docs/playtest.md`:** a Stage 3 playtest section, timing a fresh group from opening the page to Go (target 30 s), with a notes sheet.
- **Question 1 (lobby timing):** a) timed by hand on the playtest sheet. Nothing in the log, since it opens only at match start.
- **Question 2 (spectators and waiting players):** a) names in `matchStart` and the `playNextRound` line; their whole stay isn't logged.
- **Question 3:** a) yes, the summary header's "1 lives" becomes "1 life".
- **Question 4, ok:** part 1 is built and committed first, then the check matches.
- **Question 5 (results, Play again):** a) left out of the log, which closes at `matchEnd` as today.
- **Part 2, five check matches** in Docker over the Wi-Fi, run by the user. Fix only what blocks a full match.
  1. A fresh group joins by QR, timed to Go.
  2. A solo player with a partner bot against a crew of two players.
  3. 1 bot ship plus 2 player crews, Last Afloat, hazards on.
  4. A late joiner waits, then plays the next round; a spectator watches on a TV, then picks Play next round.
  5. Results, then Play again, then back to the lobby after 20 s.
- **Part 1 built (2026-10-29):**
  - **Log:**
    - Each `matchStart` crew gets `bots`, the roles its bots play (pilot first), and `botShip`.
    - The line adds `botShipsSetting`, `spectators` (names) and `waiting`. These fields come only from the room; when they aren't given, the line is as before.
    - A spectator's **Play next round** during a match writes `playNextRound` (player).
  - **Summary:**
    - New figures: `botShips` (crews), `botShipsSetting`, `spectators` and `playNextRound`.
    - `spectators` holds each name once: those at the start and those joining later as spectators.
    - Logs from before slice 11 give null for the first three and an empty list for `playNextRound`.
    - The header adds "· Bot ships: 1 (2 asked) · Spectators: 2", or "Bot ships: none". It's left out for older logs, so their summaries print as before.
    - A bot ship's crew prints as "Bots (bot ship)".
    - "1 lives" is now "1 life".
  - **`docs/playtest.md`:** a Stage 3 playtest section with a timed start, rounds that try the rest of the lobby, two notes sheets and what the summary adds.
  - **Chosen while building (to confirm):**
    - The plan said "bot crew members are marked `bot: true`". The crews' `pilot` and `gunner` stay plain names (so older readers still work), and a `bots` list of roles goes beside them.
    - `waiting` is almost always 0 at match start: between matches every player is in a crew. Late joiners show as `playerJoined` with no ship, as before.
    - Waiting players don't ask to play the next round; they join it anyway. So `playNextRound` comes only from spectators.
    - When fewer bot ships fit than asked, the header shows "Bot ships: 0 (2 asked)" rather than "none".
  - **Tests:**
    - events: 3 new (the lobby fields, left out when not given, `playNextRound`);
    - room: 1 new (bots, a bot ship, the setting and a spectator in `matchStart`; Play next round logged);
    - summary: 3 new, on a hand-made Stage 3 log (the figures, older logs, the header and crew names).
  - **Runs:** type-check clean; unit 1020 passed (plus 1 skipped); one full browser run, 31 of 31 passed (peak load 24).
- **Part 2 deferred, still owed (2026-10-29, user's choice):** the five check matches above will be run later by the user. The run sheet:
  - Start with `sudo HOST_IP=$(hostname -I | cut -d' ' -f1) docker compose up --build -d` in a normal terminal.
  - Note on the Stage 3 sheets in `docs/playtest.md`.
  - Then tell Claude which matches were played. Claude reads the newest `logs/` files, runs the summary on each and checks them against the five set-ups. It fixes only what blocks a full match; the rest goes to `NOTES.md`.
  - This joins the other deferred items: the Stage 1 combined playtest, and the Stage 2 check matches and playtest. Stage 3's definition of done (the 30-second timing in a Stage 3 playtest) stays open until then.

### 2026-10-29 — Stage 3 wrap-up deferred; Stage 4 planning starts

- **Deferred, still owed (user's choice):** Stage 3 slice 11 part 2 (the five check matches) and the Stage 3 playtest (the 30-second timing). Stage 3's definition of done items 1 and 2 stay open until then.
- **Stage 4 planning starts** ("let's move on"): Claude drafts the plan from `docs/design.md` and the "Later" notes. Nothing is built until the user approves it.

### 2026-10-29 — Stage 4 planning (polish and online)

Drafted from `docs/design.md`, the roadmap and the "Later" notes. Question: **is it ready for people outside the house?**

- **Question 1 (art):** a) Claude draws it in code and SVG files in the repo, following the look-options canvas. No image files from elsewhere.
- **Question 2:** a) Claude may read the look-options canvas (claude.ai artifact `FLuXfCmELFG21y2rCCXoKY`) to follow its mock-ups.
- **Question 3 (font):** b) no hand-drawn font for now; keep today's system fonts. It can be added later.
- **Question 4 (sound):** a) every sound is tones and noise generated in the browser, with no files and no library.
- **Question 5 (tuning):** a) tuning waits until the user has run at least one of the owed playtests; the other slices are built meanwhile.
- **Question 6 (cloud hosting):** c) decided later; everything else is built first.
- **Question 7 (logs online):** c) decided together with question 6.
- **Question 8 (spectator delay online):** deferred to the last stage (Stage 5).
- **Question 9:** all three "Later" items come into Stage 4: "Add to Home Screen" (web app manifest), first-match control hints, and the 667 px top bar fix during the art rework.
- **Question 10 (definition of done):** skipped by the user; no definition of done is set for Stage 4 for now.
- **Slice order (proposed after the answers, to confirm):**
  1. Countdown beeps and the speaker switch
  2. Sound effects
  3. Sea-chart look: sea, islands, reefs, wrecks
  4. Sea-chart look: ships, turrets, ghosts, packs, shots, mines, torpedoes
  5. Sea-chart look: storms, whirlpool, kraken, haunted zones
  6. Styled lifebar and visible damage below 25%
  7. Sea-chart look for the lobby, waiting, results and spectator screens and the top bar, including the 667 px fix
  8. First-match control hints
  9. "Add to Home Screen"

  Then, once their decisions are made: tuning (after a playtest), and cloud hosting with logs online.

### 2026-10-29 — Stage 4 slice order confirmed; slice 1 plan: countdown beeps and the speaker switch

- **Slice order:** ok, as proposed above.
- **Slice 1 plan:** approved with "go".
  - The beeps are as agreed on 2026-10-25 ("Later").
  - Every device showing the game hears them: players, spectators, and waiting players who watch.
  - The speaker switch is 🔊 / 🔇 in the top bar, on by default and remembered per device.
  - Tones come from Web Audio and are unlocked at the first tap or key press.
  - Each device works out its beeps from the synced match clock, and a jump in the clock skips the missed beeps.
- **Questions:** answered with "go", so the recommended options and proposed values stand:
  1. The values as proposed: countdown 660 Hz 0.15 s; Go! 990 Hz 0.3 s; clock beep 880 Hz 0.12 s; high beep 1320 Hz 0.12 s; double beep 2 × 880 Hz 0.1 s with 0.15 s of silence between; horn 220 Hz, buzzier (sawtooth), 0.8 s; volume 0.2. A clock jump of more than 1.5 s plays none of the skipped beeps.
  2. a) the button is kept small now, and the 667 px fix comes in slice 7.
  3. a) an iPhone on silent may stay quiet; this is accepted and goes in the playtest notes.
  4. a) no beeps for waiting players who aren't watching the match.
- **Built (2026-10-29):**
  - `client/src/game/beeps.ts`: `BeepClock` turns each update of phase, countdown and time left into the beeps due.
    - A count beep each time the 3-2-1 changes, then Go! as the match runs.
    - The clock marks are 1:00, 0:10 to 0:04, 0:03 to 0:01, and the horn at 0:00, only while running. An early end leaves time on the clock, so there's no horn.
    - A page opened mid-match doesn't beep for where the clock already is.
  - `sound.ts` plays the tones, with a 10 ms fade in and a 20 ms fade out so they don't click. It is unlocked by the page's taps and key presses (`main.ts`).
  - `soundSetting.ts` holds the remembered switch (`sinkOrSail.sound`, "on" / "off").
  - `game.ts` runs the beeps each frame. While the switch is off nothing plays.
  - The page lists every beep it played in `data-beeps`, for the browser test.
  - `tuning.ts` gains `client.sound`.
  - **Tests:** beeps (9), the switch (4), and a browser test: 3, 2, 1, Go!; the switch turns beeps off; saved on the device; still off for the next match.
  - **Runs:**
    - Type-check clean; unit 1033 passed (plus 1 skipped). The new sound test passed alone and in both full runs.
    - Both full browser runs (runs 24 and 25, peak load 19 and 24) had the same one failure, in "loads, joins a room and shows a ship": the game view appeared only after the 3-2-1, so the page went straight to "Go!".
    - This is the slice 9 failure. It also failed in 2 of the 3 runs before this slice, it passes on its own, and this slice doesn't touch it.
    - The user chose to commit as it is and **investigate later** (Later, "Smoke test misses the 3-2-1").

### 2026-10-29 — Stage 4 slice 2 plan: sound effects (questions open)

- **Plan drafted:**
  - Browser-made sound effects for the sea's events, with the same 🔊 / 🔇 switch.
  - Own-ship sounds louder, others at half volume.
  - No ambience or panning.
  - Questions 1–6 (the sound list, cues from the server, volume, spectators, busy moments, results fanfare) wait for the user's answers.
- **More than 2 ships (user's question):** with 3 ships the plan holds up. Up to 10 ships (Stage 5) would bury your own sounds.
  - **Yes:** an overall cap of **8 sounds playing at once** is built in this slice. When it is full, the quietest sound is dropped first, so your own ship's sounds get through.
  - **Yes:** the volume rule is one small function, so Stage 5 can add distance there.
  - **Later (Stage 5):** distance and off-screen fading.
- **Answers (user: "agree to all suggestions"):**
  1. **The sound list as proposed:**
     - Everyone hears: gun pop, hit thud, shield clink, sinking rumble and splash, mine plop, boom (mine blast, torpedo hit), torpedo swoosh, EMP zap, wreck crack, hazard warning hum, kraken growl, ram knock.
     - Own crew only: boost whoosh, empty-bar buzz, respawn chime, pack pickup chime, health chord, reef scrape.
     - No ambience, no panning. The values go in `tuning.ts`.
  2. a) the server sends each tick's sound cues (event kind and ship) as a small message.
  3. a) other ships' sounds play at half volume wherever they are on the sea; your own ship's at full volume.
  4. a) spectators hear every "everyone" sound at half volume, and none of the "own only" ones.
  5. a) at most one sound of each kind every 60 ms (as well as the cap of 8 at once).
  6. a) no results fanfare; the slice 1 horn is enough.
- **Built (2026-10-29):**
  - **Server:**
    - `server/src/rooms/cues.ts` (`soundCues`) turns a step's simulation events into cues `{ k, s }`: the kind and the ships each sound belongs to.
    - A mine blast belongs to the ships it hit, or to its owner when it hit none. A ram belongs to both ships, a wreck to the ship credited, an EMP to the firing ship and the ships caught, and a hazard's signal to none.
    - A health pack's pickup sounds as the health chord only.
    - `CrewRoom` broadcasts each tick's cues (`ServerMessage.Cues`) when there are any, only while the match runs.
  - **Shared:** `CUE_KINDS`, `OWN_CREW_CUES` and `SoundCue` in `rooms.ts`. `tuning.ts` gains `client.sfx`: volume 0.25, others 0.5, 60 ms, 8 at once, and each sound's parts.
  - **Client:**
    - `sfx.ts`: `cueVolume`, `soundSeconds` and `SfxMixer`, which applies the per-kind gap and the cap, stopping the quietest sound playing when a louder one comes.
    - `sound.ts` `playSfx` makes each part as a tone or filtered noise, with a short fade in and a decay to silence.
    - The lobby forwards cues to the game view, so pages not showing it ignore them. `game.ts` plays them and lists them in `data-sfx`.
  - **Chosen while building (to confirm):** the effects' parts as listed in `tuning.ts`.
  - **Tests:**
    - server cues (5): every kind with its ships, blasts, rams, wrecks, hazards, health pickup, events with no sound;
    - room (1): cues reach the clients while the match runs, none while paused;
    - client (6): volume for own, others and spectators; the per-kind gap; the cap; silent sounds;
    - browser (1): the gunner fires and the page plays "shot".
  - A temporary browser check (deleted) confirmed that the real audio code runs in Chrome without page errors.
  - **Runs:** type-check clean; unit 1045 passed (plus 1 skipped); one full browser run, 33 of 33 passed (peak load 25).

### 2026-10-29 — Stage 4 slice 3 plan: sea-chart look (sea, islands, reefs, wrecks)

- **From the look-options canvas** ("1 · Tabletop sea chart", read 2026-10-29):
  - **Sea:** pale chart blue `#BFD9E3`, with faint ink grid lines every 200 sea units, wave squiggles in open water and a faint compass rose.
  - **Ink:** dark brown `#3B2F22`, slightly hand-drawn.
  - **Islands:** sand `#DCC79B` with an ink outline, a dotted shallow line outside the coast, and palm marks on the bigger ones.
  - **Reefs:** the chart's rock symbol (ink dots and ✕ marks) on a lighter water tint.
  - **Wrecks:** today's pieces in tan `#CDB98E` with ink outlines and a broken mast; the pack glint stays, in ink and cream.
  - **Frame and edge:** a soft vignette at the edge.
  - **Drawing:** decoration is placed in a fixed way per layout, the same on every device. The parts that never change are drawn once per match on their own layer.
- **Question 1:** a) in this slice, today's white and light-blue marks (shots, pack outlines, signal glows, the EMP ring) also switch to ink or dark colours so they show on pale water. Only the colour changes; slice 4 does their real look.
- **Question 2:** c) no hatched border; just the thin ruled ink line at the sea's edge.
- **Question 3:** a) no labels on the chart.
- **Question 4:** a) one faint compass rose in the bottom-right corner, under the ships.
- **Question 5:** a) the background around the sea becomes the chart's darker blue `#1F4A63` now.
- **Go-ahead:** "yes" (2026-10-29).
- **Built (2026-10-29):**
  - **`client/src/game/chartLook.ts`:**
    - the palette (`CHART`);
    - pure placement: `waveSpots` (on a grid symmetric about the middle, in open water), `palmSpots` (1 per 9000 square units, at most 3, 14 from the coast), `reefMarks` (on a 20-unit grid, about one in three a cross, at least one per reef);
    - outlines: `offsetPolygon` (the shallows) and `inkOutline` (the coast in 14-unit steps, each nudged up to 1.5);
    - `gridLines` and `chartMarks`.
    - Every jitter reads the distance from the middle, not the side, so mirrored layouts get mirrored decoration.
    - The numbers are in `tuning.ts` `client.chart`.
  - **`GameScene`:**
    - a chart layer of its own, drawn when the layout or reefs change (once per match), under everything else;
    - wrecks in tan with ink outlines, a broken mast, and an ink-backed cream glint;
    - marks that were white or light blue on the old dark sea are now ink or dark: shots, the aim guide, signal rings and glows, wakes, ghost flags, kraken bubbles and the closing storm's final circle;
    - the unarmed mine is ink-grey; the EMP ring, sparks and shield are blue `#1D5FA8`.
  - **`game.ts`:**
    - the background is `#1F4A63`;
    - `data-chart` gives layout:waves:palms:reef marks, for the browser tests.
  - **Chosen while building (to confirm):**
    - the wave squiggle is two small humps;
    - the compass rose sits at (1490, 790), radius 34, at 40% ink;
    - reefs are a lighter tint with a faint dotted edge;
    - the soft dark edge is 16 thin strips fading inward over 64 units;
    - the shield and EMP blue is `#1D5FA8`.
  - **Checked by eye:** throwaway screenshots (deleted) of One Island, Twin Isles, The Ring and Archipelago.
  - **Tests:**
    - chart look (19): every layout's waves in open water; the same every time; mirrored on mirrored layouts; palms inside, away from the coast and mirrored; reef marks inside with both kinds, more on bigger reefs and mirrored; the outward offset; the ink outline within its wobble; the grid; the counts;
    - browser: the layouts test checks both pages drew the same Slalom chart.
  - **Runs:**
    - Type-check clean; unit 1064 passed (plus 1 skipped).
    - Full browser run 27 (peak load 27) failed only the smoke test's missed 3-2-1, the known flake under Later, so "three ships" and "ghosts" didn't run. Those two and the smoke test then passed on their own.
    - The user chose to commit as it is.

### 2026-10-29 — Stage 4 slice 4 plan: sea-chart look (ships, turrets, ghosts, packs, shots, mines, torpedoes)

- **From the mock-up:**
  - **Ships:** the rounded hull with a pointed bow, at today's size (bow 28, stern 22, about 25 wide), in the crew colour with a 2.5 ink outline. It has cream deck planks, the crew symbol in cream on the deck, and an ink turret with a cream rim. Hit flash, fade, blink, EMP look, shield and boost wake are unchanged.
  - **Ghosts:** the new hull as a faint dashed outline in the crew colour, with the symbol.
  - **Shots:** ink dots. **Mines:** the ink mine with four spikes, open before arming and solid with a blinking red ring once armed.
  - **Torpedoes:** an ink capsule with a cream nose and an ink wake.
  - **Pack signals:** a pulsing dashed ink ring.
- **Answers (user: "agree to all suggestions"):**
  1. a) chart-toned versions of today's crew colours everywhere: orange `#C9782A`, magenta `#B0407A`, teal `#2A7F78`.
  2. a) a dashed ink ring round your own ship.
  3. a) packs keep a shape per type, in cream with ink outlines and ink icons, plus a faint dashed ring. The top bar and Pack button keep white icons until slice 7.
  4. a) two fading dots trail behind each shot.
- **Go-ahead:** "yes" (2026-10-29).
- **Built (2026-10-29):**
  - **`hull.ts`:**
    - `HULL` is the mock-up's curves, sampled to 26 points and scaled so the bow is at 28. It is mirror-symmetric and inside the collision circle.
    - `deckLines`: three cream planks.
    - `shotTrail`: two dots 7 and 14 behind the shot, at 0.75 and 0.5 of its size and alpha 0.55 and 0.3.
  - **`crews.ts`:** colours `#C9782A`, `#B0407A`, `#2A7F78`.
  - **`GameScene`:**
    - **Ships:** a 2.5 ink outline, cream planks, a cream crew symbol on the deck near the stern, and an ink turret and barrel with cream rims.
    - **Own ship:** a dashed ink ring (radius 35, so it clears the lifebar).
    - **Packs:** cream shapes with ink outlines, ink-tinted icons and a dashed ring (radius + 9). The signal is a pulsing dashed ink ring.
    - **Shots:** ink dots (radius 3.5) with their trail.
    - **Mines:** an ink-grey ring with four spikes until armed, then solid ink with a blinking chart-red `#B23A2E` ring.
    - **Torpedoes:** an ink capsule with a cream nose.
  - **Ghosts:** they use the new hull automatically, unchanged otherwise (dashed, crew colour, 0.85).
  - **`tuning.ts`:** `client.shotRadius` 3.5 and `client.ownShipRing` 35.
  - **Tests changed for the new colours:** the expected crew colours in `crews.test.ts`, `hud.test.ts` and `crewList.test.ts` now hold the agreed new values. The checks themselves are unchanged.
  - **Noticed, not changed (for slice 7):** the deeper crew colours are darker on the dark top bar (the magenta "■ Crew 2" text is harder to read there). Slice 7 restyles the top bar.
  - **Checked by eye:** throwaway screenshots (deleted) of a gunner firing at a bot ship, a mine pack on the sea, and a dropped armed mine.
  - **Tests:** hull (2 new: smooth, symmetric, bow first; planks inside); shot trail (1).
  - **Runs:**
    - Type-check clean; unit 1067 passed (plus 1 skipped).
    - Full browser run 28 (peak load 29) had 2 failures: the known smoke-test miss of the 3-2-1, and the whirlpool test (its ship didn't reach the eye within 60 s, a steering failure under load).
    - Both then passed alone (whirlpool in 26 s), and so did "three ships" and "ghosts".
    - The user chose to commit as it is.

### 2026-10-29 — Stage 4 slice 5 plan: sea-chart look (storms, whirlpool, kraken, haunted zones)

- **Plan:** only the look changes; the hazards act as before.
  - **Closing storm:** a dark ink wash outside the safe circle, a hand-inked jagged edge, and the dashed final circle.
  - **Moving storm:** a dark cloud with a scalloped ink edge and cream swirls, still almost opaque.
  - **Whirlpool:** a darker-water tint, ink spiral arms and an ink eye.
  - **Kraken:** an old-map sea monster: ink-outlined tentacles and body with a coloured wash, cream eyes, a cream flash when shot.
  - **Haunted zones:** a darkening brown-black ink wash with drifting ink smudges.
  - **Unchanged:** ghosts, and the hazards' signals (already ink).
- **Answers (user: "go with your suggestions", also the go-ahead):**
  1. a) kraken in ink with a muted sea-green wash `#5E7D6A`.
  2. a) the closing storm adds diagonal ink hatching.
  3. a) the moving storm is dark ink-brown with cream swirls.
- **Built (2026-10-29):**
  - **`hazardLook.ts` `stormHatch`:** diagonal lines 24 apart (`client.chart.stormHatch`) across the sea, cut to the pieces outside the safe circle.
  - **`chartLook.ts`:** `CHART.storm` `#2B2118` and `CHART.kraken` `#5E7D6A`.
  - **`GameScene`:**
    - **Closing storm:** a brown-black wash (0.55) plus the hatching at 0.4, and an ink jagged edge.
    - **Moving storm:** a brown-black cloud with ink-backed puffs (a scalloped ink edge) and cream swirls.
    - **Whirlpool:** a deep-blue tint (0.25), an ink rim, ink spiral arms and an ink eye.
    - **Kraken:** tentacles inked then washed sea-green, the body to match, cream eyes with ink pupils, and a cream flash.
    - **Haunting:** a brown-black wash (0.3 × meter) and smudges (0.12 × meter).
    - A stray comment from slice 3 is removed.
  - **Noticed, not changed (for slice 7):** the white "Storm closing" status line over the pale sea relies on its text shadow.
  - **Checked by eye:** throwaway screenshots (deleted) of the closing storm, an active moving storm, an active whirlpool and the kraken. Haunting wasn't screenshotted, because it takes a long 3-ship Last Afloat setup.
  - **Tests:** `stormHatch` (2): only outside the circle and inside the sea; more as the circle closes, none while it covers the sea.
  - **Runs:**
    - Type-check clean; unit 1069 passed (plus 1 skipped).
    - Full browser run 29 (peak load 24) had 2 failures with the known cause, the game view coming up after the 3-2-1: the smoke test, and the layouts test (its "Layout: Slalom" banner shows only during the countdown).
    - Both passed alone, as did "three ships" and "ghosts".
    - The user chose to **commit, then investigate** the slow game view before slice 6.

### 2026-10-29 — Countdown on slow devices (the smoke test's missed 3-2-1, investigated)

- **Cause:**
  - The 3-2-1, the layout banner and the countdown beeps were updated only from the game scene's per-frame callback.
  - The scene draws its first frame only after Phaser starts and loads the pack icons.
  - Measured from Start: normally the first frame came at 0.2 s; with Chrome 6× slower at 0.8 s; 20× slower at **2.8 s**, almost at Go!.
  - A busy test machine, or a slow phone, missed the countdown, the banner and the beeps.
- **Fix (user: "yes"):**
  - The countdown text, the layout banner and the countdown beeps run on their own loop in `game.ts`, 20 times a second from the room state, starting as soon as the game view opens.
  - The sinking banner, the sink vibration and the results stay on the scene's frames.
- **Test:** a new browser smoke test slows Chrome 20× and checks that the countdown shows 3 or 2, the layout banner shows, and at least two count beeps play. Without the fix it failed 4 times in 4 (it saw "Go!"); with it, it passed 4 times in 4.
- **While testing:**
  - **The loop's timer:** a first version ran on a 20-per-second timer. In full runs Chrome let it lag by over a second, so the sound test heard "count,go". It now runs on animation frames (`requestAnimationFrame`), like drawing, but not Phaser's.
  - **The new test's group:** it slows Chrome 20× on top of a busy machine, which was too much in a full run (it caught "1"). It moved to `e2e/slowDevice.spec.ts`, in a fourth browser-test group, "slow device", that runs after "ghosts". It passed 3 of 3 there.
- **Runs:**
  - Type-check clean; unit 1069 passed (plus 1 skipped).
  - Full run 32: the smoke, layouts and slow-device tests all passed. Two steering tests failed under extreme load (peak 52, twice the usual run time; the user's Brave browser was busy): the kraken and the whirlpool.
  - The user chose to commit.
- **Later:** keeping Phaser running between matches, so the pack icons aren't reloaded each match, would make the sea appear sooner too (see Later).

### 2026-10-29 — Stage 4 slice 6 plan: styled lifebar and visible damage

- **Answers (user: "go with your suggestions", also the go-ahead):**
  1. a) the lifebar becomes a cream bar with a thin ink outline. The fill keeps the Stage 3 rules in chart tones: green `#3E7B3A`, amber `#D9A02B` and red `#B23A2E`. It has two ink ticks at 25% and 50%, and the same size and place as before.
  2. a) below 25% of full health a ship shows visible damage: ink cracks on the deck, two small flickering flames, and drifting ink-grey smoke. It goes when the ship heals to 25% or more, or respawns. Other crews don't see it on a ship hidden in a moving storm.
  3. a) the smoke drifts back from the stern, so a moving ship trails it.
- **Built (2026-10-29):**
  - **`lifebar.ts`:** `LIFEBAR_TICKS` at the colour changes (0.25, 0.5).
  - **`damageLook.ts`:**
    - `isDamaged`: afloat and below `client.damage.below` (0.25) of full health;
    - `hullCracks` and `flameSpots`: in the hull's frame, turning with it;
    - `smokePuffs`: 6 puffs, one every 0.3 s, drifting back from the stern at 30 with a little sway, growing from 5 to 15 and fading from 0.45.
  - **`GameScene`:**
    - **Lifebar:** a cream bar, a chart-toned fill, ink ticks and a thin ink outline.
    - **Damage:** ink cracks; flames in chart red with an ink rim and a yellow heart (made bolder after a screenshot showed them lost on Crew 1's orange hull); smoke `#5A5048`.
    - Damage follows the lifebar's storm rule (not on another crew's ship hidden in a moving storm).
  - **`game.ts`:** `data-damaged` lists the ships this player sees damaged.
  - **Checked by eye:** throwaway screenshots (deleted) of a damaged ship sailing in the closing storm.
  - **Tests:**
    - damage look (4): the threshold; cracks and flames on the deck, turning; the smoke stream drifting back, growing and fading; the other way for the other heading;
    - lifebar ticks (1);
    - browser: the closing-storm test now also waits until both crews see the ship left in the storm as damaged (its time limit is 90 s).
  - **Runs:**
    - Type-check clean; unit 1074 passed (plus 1 skipped).
    - Full browser run 33 (peak load 21) had 1 failure: the phone gunner test's Fire button not showing within 5 s. That is probably the same delay as the countdown (the phone controls appear once the scene draws); it was also seen in slice 9.
    - It passed alone, as did the three later groups.
    - The user chose to commit as it is (2026-10-30).

### 2026-10-30 — Stage 4 slice 7 plan: sea-chart look for the screens and the top bar (with the 667 px fix)

- **From the mock-ups** (Join, Crew and role, Host settings, Waiting, both phone controllers; read 2026-10-30):
  - **Everywhere:** a pale chart-blue background with the ink grid; cream cards with a 2px ink border and an offset shadow; ink text; dark ink main buttons with cream text; system serif fonts (Georgia).
  - **Join screen:** the title over an inked ship.
  - **Lobby:** a cream header with the code and a mode badge, a "Your crew" card with a two-part Pilot/Gunner switch, a crew list with colour swatches, and a footer with Ready/Start. The host card holds the QR code (on white) and the settings.
  - **Waiting screen:** as its mock-up.
  - **Overlays:** the countdown in ink with a cream outline; cream banner, storm status, results and pause cards.
  - **Phone controls:** a cream stick with an ink knob; Boost in the crew colour; Fire chart red; Shield and Pack cream, the Pack button glowing in the crew colour when lit. The mock-ups' "Touch anywhere" hint is left for slice 8.
  - **Unchanged:** every id, so tests and code still find everything.
  - **667 px fix:** under 720 px the top bar gets smaller text, tighter gaps and compact buttons; the energy bar keeps at least 120 px.
- **Question 1:** a) the top bar is a cream strip above the sea, with an ink line under it. The role is a tag in the crew colour; the crew name is ink.
- **Question 2:** b) the energy bar keeps today's green fill.
- **Question 3:** b) on wide screens the lobby has two columns: your crew and the crews on the left, the host card and settings on the right. On phones it is one column.
- **Go-ahead:** "yes" (2026-10-30).
- **Built (2026-10-30):**
  - **`client/index.html`:**
    - new styles (colour variables; cream cards with an ink border and offset shadow; ink main buttons; Georgia);
    - the join screen as its mock-up: an inked ship and title, a code-and-name card, Join room and Watch, "or", Host a new room, and a hint;
    - the room screen:
      - a header bar with the code and a mode badge;
      - two columns: on the left your name, your crew card with the hull swatch and the Pilot/Gunner switch, the waiting screen, and the crews; on the right the host card with the QR code and the settings card;
      - a sticky footer with Ready, Start, Watch instead / Play next round and Leave. It is compact on phones.
    - Every id is kept. The button wording follows the mock-up: Create room → "Host a new room", Join → "Join room".
  - **Top bar:** cream with an ink line, the role tag in the crew colour, the crew name in ink, ink pack icons, and the energy bar's green kept.
  - **667 px fix:** under 720 px the gaps and text tighten, the crew name and the "Packs:" word are left out (the role tag's colour and the score's symbols still show the crew), and the energy bar keeps at least 120 px.
  - **Overlays:** the countdown in ink with a cream glow; the storm status as an ink tag (red when you're in the storm); cream banner, results and pause cards; "Rotate your phone" on the chart blue.
  - **Phone controls:** a cream stick with an ink knob; Boost in the crew colour; Fire chart red; Shield and Pack cream, Pack glowing in the crew colour when lit. Buttons press down when held.
  - **`lobby.ts`:** the header's code and mode, and the crew hull colour (the title is ink).
  - **`game.ts`:** the role tag colour, a `--crew` colour for the controls, and the "Packs:" label in a span of its own.
  - **Checked by eye:** throwaway screenshots (deleted) of the join screen, lobby, waiting screen, countdown, phone game with controls, pause and results, on a laptop and a phone. After them, the phone footer was made compact and crew rows wrap.
  - **Tests:** browser (1 new): on a 667 × 375 phone the host's top bar fits and the energy bar is at least 120 px (before: 4 px).
  - **Runs:**
    - Type-check clean; unit 1074 passed (plus 1 skipped).
    - Full runs 34 and 35 (peak load 32 and 34) each failed only the sound test: the page's frames came over a second apart during the 3-2-1, so it heard "count,go", then "count,count,go".
    - Between them, the countdown loop's first tick was moved to run at once when the game view opens (not on the next frame). The sound test then passed 4 of 4 alone.
    - Chrome's page CPU in these runs was about 386%, against 322% in slice 6's run and 328–375% in earlier ones.
    - The user chose to commit as it is.

### 2026-10-30 — Stage 4 slice 8 plan: first-match control hints

- **Why:** the 2026-10-28 new-player watch item (a child gunner on a phone barely fired) and the mock-ups' control labels.
- **Answers (user: "go with your suggestions", also the go-ahead):**
  1. a) each hint stays until its control is first used on this device (remembered), and fades after 30 s of play; a "Hide hints" button clears them.
  2. a) laptops get a one-line key guide along the bottom of the sea.
  3. a) a Pack hint when your crew first holds a pack your role can use (the Pack-button watch item).
  4. **The wording as proposed:**
     - **Phone pilot:** "Touch anywhere on this side to steer", "Hold for speed (uses energy)", "Drop your mine".
     - **Phone gunner:** "Touch anywhere on this side to aim", "Hold to fire", "Hold to block shots (uses energy)", "Fire your torpedo" / "Fire your EMP".
     - **Laptop pilot:** "W A S D steer · Space boost · E drop the mine".
     - **Laptop gunner:** "Mouse aims · click fires · right-click shields · E fires the pack".
     - **Ghost:** "Steer your ghost: W A S D" or "… the stick".
- **Built (2026-10-30):**
  - **`client/src/game/hints.ts`:**
    - `hintsFor`: the hints to show, by role, phone or laptop, ghost, usable pack and seconds of play; none from 30 s (`client.hintSeconds`).
    - `usedControls`: the controls an input used, as device:role:control (a stick or aim moved past 0.3; any button held).
    - `loadUsedHints` and `saveUsedHints`: `sinkOrSail.hints`.
    - The laptop line goes once both of the role's main controls are used (pilot: steer and boost; gunner: fire and shield).
  - **`index.html`:** cream hint labels with ink borders.
    - **Phone:** the left-side hint above the stick, under Boost or Fire, under Shield, left of Pack.
    - **Laptop:** the key line along the bottom of the sea.
    - **"Hide hints":** a small button at the top right of the sea. It marks the hints showing as used.
  - **`game.ts`:** each frame records the controls used and shows the hints still needed, for a crew member during the countdown and the match.
  - **Chosen while building (to confirm):** "Hide hints" counts as having used those controls, so they don't come back on this device. The laptop's mouse aim counts as used as soon as the mouse moves.
  - **Checked by eye:** a throwaway screenshot (deleted) of a pilot and a gunner on a 667 × 375 phone. The Shield hint then moved under its button, clear of the middle of the sea.
  - **Tests:**
    - hints (9): each role on a phone, the laptop lines, the ghost, used controls, the 30 s fade, reading inputs, remembering (and blocked or odd storage);
    - browser (2): a phone gunner's "Hold to fire" goes on firing and stays gone next match while Shield's comes back; a laptop pilot's key line goes after steering and boosting.
  - **Runs:**
    - Type-check clean; unit 1083 passed (plus 1 skipped).
    - Full run 36 (peak load 28) had one failure: the laptop mine-pack test's top-bar pack slots were not filled in within 5 s of Start. That is probably the top bar waiting for the scene, like the phone Fire button.
    - It passed alone, as did the later groups.
    - The user chose to **commit, then fix the wait** (the top bar and phone controls not waiting for the scene), with its own plan.

### 2026-10-30 — The top bar and controls don't wait for the sea

- **Plan (user: "yes"):** move everything on the page outside the sea from the scene's per-frame callback to the countdown's own loop, which reads the latest snapshots.
  - **Moved:** the sinking banner and results, pause controls, hints, Back / Play next round, storm status, phone controls, the rotate screen and the top bar.
  - **Kept with the scene:** what it drew, i.e. the test attributes and the phone vibrations on sinking and pickup.
- **Test method (user's choice, 2026-10-30):**
  - Slowing Chrome down no longer showed the difference. At 20× the scene now drew during "2" (the earlier 2.8 s was measured on a busier machine), and at 40× even the countdown's loop was late.
  - Instead, a **test-only page setting `?sceneDelay=…`** (ms, 1–10000; `frameLimit.ts`, like `?fps=20`; nothing for players) starts the scene that much later.
  - The "slow device" test now opens the page with `sceneDelay=4000`, so the sea arrives after the whole countdown. It checks:
    - the countdown shows 3, with the layout banner;
    - all four beeps play;
    - the top bar's role and empty pack slots appear while the countdown still shows 3;
    - nothing was drawn until then, and then the sea arrives.
  - The Chrome slowdown is gone from that test. Without the fix the test failed (no role or pack slots before the sea); with it, it passes.
- **Built (2026-10-30):** `game.ts` `updatePage` runs on the countdown loop, whose first tick now comes at the end of setting up the game view. `showMatchOverlays` no longer handles the sink vibration (that stays in the scene callback). Plus `sceneDelay` and its tests (2).
- **Runs:**
  - Type-check clean; unit 1085 passed (plus 1 skipped).
  - Full run 37 (peak load 19) had one failure: a phone test waiting more than 5 s for the scene's first drawn ships. That is the sea itself loading late (Later: keep the game scene between matches).
  - The phone tests and later groups passed alone.
  - The user chose to commit as it is.

### 2026-10-30 — Stage 4 slice 9 (Add to Home Screen) moved to the end

- **User's choice:** skip slice 9 for now and move it to the end of Stage 4. The new order after slice 8 is tuning (after a playtest), cloud hosting with logs online (once decided), then "Add to Home Screen".
- **Next (user's choice, 2026-10-30): tuning from the match logs already in `logs/`, now.** This changes the 2026-10-29 answer 5a (tuning waits for a playtest). The owed playtests stay owed.

### 2026-10-30 — Tuning from the logs: the plan

- **What the logs hold:** 97 files. 67 were left by my own server test runs on 2026-10-29 (17:56 and 19:11; players "Pilot", "Gunner", "Third", "Ana", "Ben" and so on): Vitest started from inside `server/` skips the root config that sets `LOG_DIR`. The other 30 are real: 6 full matches with two or more people (2026-10-25 QHKJ 13-54, FGBL 14-16 and 14-21; 10-27 VVGW 22-25; 10-28 LWSZ 15-40, NPYS 15-48), solo practice against an empty ship, and 5 matches with bots. All Sink Count; no Last Afloat.
- **User's answers ("go with your suggestions"):**
  1. a) The 67 test leftovers are moved out of `logs/` into the session's scratch folder (not deleted).
  2. a) Stop the leak: under Vitest (which sets `VITEST`), logs go to the temporary `sink-or-sail-test-logs` folder unless `LOG_DIR` says otherwise, wherever Vitest is started from (`server/src/config.ts` `logDir`, with 2 tests).
  3. What felt wrong in play: **not answered yet**; the report comes first.
  4. a) The tuning report is a published page with charts, private to the user, with the link given in the chat.
- **Then:** only the changes the user picks from the report, each in `tuning.ts` with tests. A change that alters packs-off play needs the user's approval to re-record the Stage 0 reference recording.

## Later

- **(2026-10-29, Stage 5) Sound by distance:** with up to 10 ships and a camera that follows your ship, other ships' sounds get quieter the further away they are, and nearly silent off screen. Stage 4 slice 2's volume rule is the place to add it. It works alongside the cap of 8 sounds at once.

- **(2026-10-30, fixed the same day; see "The top bar and controls don't wait for the sea") Phone controls wait for the scene too:** under load a phone test's Fire button showed after more than 5 s (Stage 4 slice 6's full run, and slice 9). The controls probably appear only once the scene draws, like the countdown before its fix. A fix like the countdown's, or keeping the scene between matches (next item), would help.
- **(2026-10-29) Keep the game scene between matches:** today each match makes a new Phaser game and reloads the pack icons, so the sea appears late on a slow device (about 2.8 s with Chrome 20× slower). Keeping one game running between matches would cut that. The countdown no longer waits for it (fixed 2026-10-29).
- **(2026-10-29, investigated and fixed the same day; see "Countdown on slow devices") Smoke test misses the 3-2-1:**
  - "loads, joins a room and shows a ship" fails under load in about 4 of the last 7 full browser runs (Stage 3 slices 9–11, Stage 4 slice 1).
  - The game view appears more than 3 s after Start, so `#countdown` is already "Go!".
  - Slice 9's runs saw the view in 0.4 s with the countdown text updating late.
  - It passes on its own. To find out: whether the view's start or its first drawn frames are late, and why (load, the scene's boot). Then fix the cause, or ask how the test should wait. Never weaken it without asking.

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
- **(2026-10-28, stage not set) First-match control hints**, suggested after a child on a phone barely fired in a whole match: for example a short "Tap Fire to shoot, hold Shield to block" hint on each role's controls during the first countdown, or until the player first uses them. Not to build without the user's go-ahead; decide after the Stage 1/2 playtests (with the Pack-button watch item).
