# Sink or Sail

A standalone, browser-based 2D naval battle game. Up to 10 two-person ships (20 players). Each ship has a **pilot** and a **gunner**. Players join from phones or laptops with a room code — no accounts.

Full design: `docs/design.md` (exported from the "Sink or Sail — Game Design" doc). Visual mock-ups: the Sink or Sail look-options canvas on claude.ai (sea-chart look, lobby screens, phone controllers). This file covers what Claude Code needs to build now; `docs/design.md` describes the whole game, including later stages — use it for context, not as a to-do list. When the two disagree, ask.

## Progress (updated 2026-10-25)

**Stage 0 is built** (all 10 slices). **Stage 1 is built and committed** (7 slices: pack basics and health, mine, torpedo, EMP, summary script additions, home network play, and slice 7, changes after the check matches: unpicked packs disappear, leaving a seat, two pack slots). Slice 6 ran five packs-on check matches in Docker over the Wi-Fi, two of them with 4 players, all to time-up with correct logs and summaries. Tests at the end of slice 7: 529 unit tests and 12 browser tests passing, type-check clean. **Next:** the user rebuilds Docker (`sudo docker compose up --build -d`) and runs the combined playtest. Every decision, with its date, is in `NOTES.md`.

**Changes to the plan agreed during Stage 0** (details in `NOTES.md`):
- Added after the first game: **Pause** (any seated player) / **Resume** (host only, with a 3-2-1 countdown) and **Exit game** (host only, ends the match with the current score).
- Slice 8 match flow: only the **host** (room creator, ★) starts matches; 3-2-1-Go countdown; seats locked for seated players during a match.
- Pages left open across a rebuild reload themselves and rejoin their seat.
- Energy refill slowed after games: now 5 per second (the Stage 0 reference recording was re-recorded at 5, with approval).

**Main Stage 1 decisions** (all values in `tuning.ts`; full list in `NOTES.md`):
- Packs: a replacement is signalled 8 s after the last pack appeared, one at a time, max 2 on the map. Spots holding a pack or a ship are skipped.
- Mine: radius 20; blast radius 60 (hits every ship in it, owner included); shots set off armed mines, with the shooter credited; a raised shield halves it; respawn protection blocks it.
- Torpedo: speed 300; no lifetime; launched from the bow tip; can be fired with the shield up; firing ends protection.
- EMP: radius 200. Caught ships can't fire, boost, shield or use packs for 3 s, and their shield drops at once. No stacking (a new EMP restarts the 3 s). Protected ships aren't caught; only ships are affected.
- Summary: mine hits go to whoever set the blast off; logs with no packs setting read as "Packs off"; no Packs table with packs off.
- Slice 7 (after the check matches): packs nobody picks up disappear 45 s after appearing (blinking for the last 5 s); a player leaves a seat by tapping it again or with **Leave seat** (not during a match); **two pack slots per ship**, a pilot slot (mine) and a gunner slot (torpedo or EMP), shown as `Packs: M · T` in the top bar.

**Discussed ahead of time (not to build yet):** ship types for Stage 5. There are five types with approved starting values, recorded in `NOTES.md` under "Later" (2026-10-25); the Stage 4 and 5 roadmap rows below reflect them. Whether types move earlier than Stage 5 is decided after the Stage 1 playtest.

**Stage 0 verify items:** all done (time zone 2026-10-24; phone reload and a full 4-player match 2026-10-25).

**Watch items:**
- On 667 px phones, the top bar squeezes the energy bar.
- No pack was used in any of the five slice 6 check matches; players didn't try. Is the Pack button being noticed? (For the playtest.)
- Flaky browser tests (slices 5–6): explained in slice 7. The steering helper gives up quietly after 40 s, so a slow test ship that never reached its pack made the next top-bar check fail. If a pack test fails again, check the test server's log (in the temp folder `sink-or-sail-test-logs`) for a `packExpired` before the pickup.

**After slice 7:** the user runs the combined playtest (`docs/playtest.md`) and fills in its Findings. Stage 2 is then planned with the user, using those findings (and the ship-types timing question), and arrives as a new "Current goal" section in this file. Until then, nothing from the roadmap below is built.

**Where things are:**
- `shared/src/`: `tuning.ts` (every gameplay and client number; CLAUDE.md's "`shared/tuning.ts`"), `rooms.ts` (room rules, message names), `input.ts` (input validation), `packRules.ts` (who uses each pack, labels, when the Pack button is lit), `sim/` (pure, deterministic simulation; `step()` returns the new world plus events; `packs.ts`, `mines.ts`, `torpedoes.ts`, `random.ts` seeded generator, `map.ts` spawn spots; `fixtures/stage0-run.json` is the Stage 0 reference recording that packs-off play must match).
- `server/src/`: `rooms/CrewRoom.ts` (room: codes, seats, host, match flow, 20 Hz loop), `rooms/matchFlow.ts`, `rooms/sync.ts`, `log/` (match event log, `summary.ts`).
- `client/src/`: `lobby/` (plain HTML room screen, packs toggle, `seatButtons.ts` take/leave rules), `game/` (Phaser scene, interpolation, laptop and touch controls, top bar, overlays, pack latch, EMP ring, pickup buzz).
- `e2e/`: Playwright smoke tests (laptop, emulated phone, pause/exit, stale page, `packs.spec.ts` mine and torpedo, `emp.spec.ts`; shared `helpers.ts`).
- `docs/playtest.md`: the combined playtest guide and notes sheets.

**Commands:** `npm test` (Vitest, then Playwright smoke tests with the installed Chrome), `npm run test:unit`, `npm run typecheck`, `npm run build`, `npm start` (port 2567), `npm run summary -- logs/<file>.jsonl`. Docker: `sudo docker compose up --build -d`, **in a normal terminal**; the `!` prompt has no terminal, so `sudo` can't ask for the password.

**Conventions to keep:**
- The server runs `.ts` directly through Node 22's type stripping: no enums, parameter properties or namespaces (`erasableSyntaxOnly`), and imports use `.ts` extensions.
- Colyseus 0.18 with the `schema()` builder, no decorators. Only the needed Colyseus packages, not the all-in-one `colyseus` (security advisories).
- Exact version pins; ask before adding any dependency.
- Server test files run one at a time (they share a port). Tests log to a temporary folder via `LOG_DIR`, never to the real `logs/`.
- `MATCH_SEED` fixes every match's seed (used by the browser tests: port 2577 with seed 367 for mine and torpedo, port 2578 with seed 8 for the EMP).
- Pack presses are latched on the client and server so quick taps aren't lost; the E key also uses a key-down listener.
- Phaser's own touch input is off (`input: { touch: false }`). Our touch layer handles all touch; Phaser's window-wide touch listener made aiming fire the gun.

## Roadmap (for context only — do not build ahead)

`docs/design.md` was updated on 2026-10-25 and now has six stages (0–5). Stages 0 and 1 are below. The rest, as currently planned:

| Stage | What's in it | Question it answers |
| --- | --- | --- |
| 2 · The sea fights back | Reefs, wrecks, whirlpool, kraken, moving and closing storm, ghosts, Last Afloat | Do hazards and ghosts keep sunk crews involved? |
| 3 · Full lobby | All lobby screens, bots (including a bot partner for a solo player), results and awards, spectator view (also usable by a host who only hosts and doesn't play), a **simple** lifebar for each ship, changing your name in the lobby before a match | Can a group get playing within 30 seconds? |
| 4 · Polish and online | Sea-chart art, sound, tuning, cloud hosting, a **styled** lifebar to match the art, flames, smoke or visible damage on a ship whose health drops below 25% of full | Is it ready for people outside the house? |
| 5 · More ships | Up to 10 ships (20 players), Fleet Battle, rooms and seats, 10 crew colours with symbols, map size scaling with the number of ships, a camera that follows your ship and a minimap on larger maps, more start, respawn and pack spots, respawn away from all enemies; **five ship types** (Frigate, Cutter, Ironclad, Gunboat, Long gun) differing in health, size (which sets speed and turning), rate of fire, damage, gun range and energy, picked by the pilot before each match (details and starting values in `NOTES.md`, "Later") | Does the game hold up with up to 10 ships? |

- The game stays at **2 ships** until Stage 5.
- **Known open question for Stage 2:** with 2 ships, Last Afloat ends at the first sinking, so ghosts get no time. The approach (for example extra lives per ship before a crew becomes a ghost) will be decided when Stage 2 is planned. Don't solve it in code.
- When work on the current stage suggests something for a later stage (for example a lifebar would help now), note it in `NOTES.md` under "Later" and say so; don't build it.

## Current goal: Stage 1 — packs

Answer one question: **do packs create "line it up… now!" moments for the crew?** Build on Stage 0 without changing how it plays when packs are off.

### Stage 1 scope (in)

Everything in Stage 0 stays as it is (same mode, ships, island, controls, match flow). Stage 1 adds:

- **Pack spawning:** packs appear at fixed spawn spots in open water; each spot glows before its pack appears; a ship picks a pack up by sailing over it.
- **Two pack slots per ship** (changed in slice 7 from one): a pilot slot (mine) and a gunner slot (torpedo or EMP), shown on both crewmates' screens. A ship can't pick up a pack while that role's slot is full. Each pack is used once. Held packs are lost when the ship sinks.
- **Packs nobody picks up disappear** after `packs.lifetime` (45 s), blinking near the end (slice 7).
- **Four packs:**

| Pack | Effect | Aimed by | Used by | Notes |
| --- | --- | --- | --- | --- |
| Mine | Dropped behind the stern | Pilot (route) | Pilot | Arms after a delay, then hits **any** ship that touches it, including the one that dropped it; expires after a time |
| Torpedo | Travels straight out from the bow, slower than a shot | Pilot (ship's heading is the only guide; no aiming line) | Gunner | Stopped by the island and the map edge; a raised shield halves its damage |
| EMP | Ring centred on the firing ship | Pilot (ship position) | Gunner | For 3 s, enemy ships in range lose fire, boost and shield; steering still works; the firing ship is unaffected |
| Health | Restores health | — | Applied on pickup | Doesn't use a slot, so it can be picked up with both slots full; a ship at full health sails over it without taking it |

- **Pack button:** lights up only on the controller of the role that can use what's loaded (pilot for a mine; gunner for a torpedo or EMP).
- **Host toggle in the room screen: Packs on / off** (default on), so playtests can compare rounds with and without packs. With packs off the game plays exactly as Stage 0.
- Pack events in the match event log and new figures in the summary script (see "Match event log").

### Stage 1 starting values (all go in `shared/tuning.ts`)

These were the agreed starting points. Several were refined while building (see "Main Stage 1 decisions" above); where this list and `NOTES.md` differ, `NOTES.md` and `tuning.ts` are current. Express damage and healing as a fraction of a ship's full health.

- Packs on the map at once: 2. A replacement is signalled about 8 s after one is taken.
- Spawn spots: about 6 fixed spots in open water, clear of the island and the respawn spots; the next spot is chosen by the seeded generator. A spot that already holds a pack, or has a ship on it, is not chosen.
- Spawn signal (glow) before a pack appears: 3 s.
- Pack type chances: equal (25% each).
- Mine: arms after 1 s; lasts 30 s; damage 40% of full health.
- Torpedo: speed below a normal shot's (propose a value relative to the current shot speed and ask); damage 50% of full health; halved by a raised shield.
- EMP: radius about 3 ship lengths; effect lasts 3 s.
- Health: restores 40% of full health, never above full.

The open points once listed here (torpedo lifetime, protection against mines and torpedoes, EMP against a raised shield) are now decided in `NOTES.md`. For anything else not covered: **ask, don't assume.**

### Stage 1 scope (out — do not build yet)

Reefs, wrecks, whirlpools, kraken, storm, ghosts, Last Afloat, Fleet Battle, bots, spectator view, awards, results screen beyond a simple scoreboard, final art, sound, cloud hosting, more than 2 ships, any pack not in the table above.

## Stack

- **Client:** Phaser 4 + TypeScript, bundled with Vite.
- **Server:** Node.js + Colyseus (rooms, join codes, state sync, reconnection) + TypeScript.
- **Shared:** a `shared/` package of TypeScript types and constants used by both sides.
- **Runtime:** Docker (Compose) on Ubuntu for local play.

Check current versions and APIs in each library's docs before writing code against them; don't rely on memory.

## Architecture rules

- **The server is authoritative.** Clients send only input (stick vector, button states). The server runs the simulation, resolves hits, and broadcasts state. Never trust client positions or hit claims.
- Fixed server tick (start at 20 Hz; tune later). Clients send input at a steady 20–30 Hz, not on every touch event.
- Clients interpolate between server snapshots for smooth rendering.
- Simple custom physics: ships as capsules or circles, shots as points, the island as a polygon. No physics engine. Mines are circles; torpedoes are points (like shots); the EMP is a circle check at the moment it fires.
- All tunable numbers (speeds, drift, energy costs, refill rate, damage, health, cooldowns, and every Stage 1 value) live in one `shared/tuning.ts` file. They are starting values to change during playtesting.
- Pack spawning uses the simulation's seeded generator, so the same seed gives the same packs in the same places.

## Match event log

The server records each match for analysis and, later, for awards. Log events, not every tick.

- One file per match in `logs/` (mounted as a Docker volume so files survive restarts), named by date, time and room code, one JSON object per line (JSON Lines).
- Every event carries: match time in ms, event type, and where relevant ship id, player name and role.
- Stage 0 events: match start (crews, roles, tuning values in use) and end (scores); shot fired; hit landed (attacker, target, damage); shield raised and shot blocked; boost used; energy bar hit empty; ship sunk (by whom); respawn; player joined, left or reconnected.
- **Stage 1 events:** match start also records whether packs are on; pack signalled (spot, type); pack spawned; pack picked up (ship, type); pack used (ship, type, player, role); pack lost (ship sank while holding it); health restored (ship, amount); mine armed; mine triggered (owner, ship hit, damage, whether it was the owner's own ship); mine expired; torpedo hit (attacker, target, damage, whether the shield halved it); torpedo ended without a hit (island, edge or lifetime); EMP fired (firing ship, ships caught).
- About once per second: each ship's position, heading, health and energy, plus the pack it holds (if any).
- Later stages add their own events (hazards, ghosts, awards) in the same format.
- Logging must never slow the simulation: buffer writes and flush asynchronously.
- In-game names only; no other personal data. Files stay on the laptop.
- **Summary script:** per crew sinkings, shots, hit accuracy, energy spent on boost vs shield, time spent with an empty bar, average survival time. **Stage 1 adds**, per crew: packs picked up, used and lost (by type); average time a pack was held before use; torpedoes fired and hit (accuracy); mine hits, with own-mine hits counted separately; ships caught per EMP; health restored. The summary states whether packs were on.

## Controls

### Laptop
- Pilot: WASD to steer, Space to boost, **E to drop a mine**.
- Gunner: mouse to aim, left-click to fire, right-click to shield, **E to fire a torpedo or EMP**.

### Phone (sideways only)
- **Left thumb, both roles:** a hybrid stick — visible resting spot, but it jumps to wherever the thumb lands on the left half of the screen. Small dead zone in the centre.
- **Right thumb, pilot:** large Boost button; small **Pack** button above it.
- **Right thumb, gunner:** large Fire button with Shield right beside it, and a small **Pack** button above. Fire and Shield can't be pressed together; that's intended.
- The Pack button shows the pack's name and is lit only when that role can use what's loaded; otherwise it is dim and does nothing.
- When a torpedo or EMP is loaded, the gunner's phone vibrates briefly (Android only; iPhone browsers don't support vibration, so skip it there silently).
- Top of screen: role, crew, shared energy bar, the two pack slots (`Packs: M · T`), score and timer.
- Support multi-touch (stick + button at once) with pointer events.
- Block browser gestures on the game screen: pinch-zoom, double-tap zoom, pull-to-refresh, text selection.
- Android: request fullscreen and lock to landscape. iPhone can't lock orientation from a browser: show a "rotate your phone" screen in portrait.

## Visual rules (apply even with placeholder art)

- Ships are top-down hull shapes (pointed bow), not circles, and point the way they are sailing.
- Every ship shows its turret direction. Only your own ship shows the aiming guide (dashed line, cone, crosshair).
- **No aiming guide for torpedoes:** the bow is the sight.
- Crew colours must be clearly distinct; pair each with a symbol for colour-blind players.
- Each player sees the same amount of sea whatever their device, so laptops get no advantage.
- **Stage 1 placeholders:** a spawn spot glows (a pulsing ring) while signalled; each pack type has its own simple shape and letter (M, T, E, H) so it reads without colour; a mine is visible to everyone and looks different once armed; a torpedo is visibly larger and slower than a shot; the EMP shows an expanding ring, and ships caught by it look disabled for the 3 s.

## Rules of engagement (non-negotiable)

- **Follow this plan strictly, without deviation.** Build only what the current slice lists, in the order given. No extra features, refactors, libraries or "while I'm here" changes.
- **Never assume. Ask.** If anything is unclear, missing, contradictory, or needs a choice (a number, a behaviour, a library, a file layout not specified here), stop and ask before writing code. Ask specific questions with options where possible. Record each answer in `NOTES.md` under "Decisions" with the date.
- **No silent changes.** Do not change the stack, scope, tuning values, controls or design rules without asking first. Do not add a dependency without asking and saying why.
- **Each slice starts with a plan and waits for a go-ahead:** what it builds, the files it touches, the tests it adds. Start only when told to proceed.
- **Each slice ends with:** all tests passing, type-check clean, a short summary of what changed, and how to run and try it on a laptop and a phone. Then stop and wait.
- If a slice turns out bigger than expected, or something here seems wrong, say so and propose a change. Do not adjust the plan yourself.
- Scope-creep ideas go in `NOTES.md` under "Later", never into code.
- Give a short explanation alongside each setup step (commands, config, Docker).
- Prefer Ubuntu's official repositories for system packages. Ask before installing anything system-wide.
- Commit at the end of each slice with a clear message, only after tests pass.
- **Stage 0 must keep working:** every existing test keeps passing, and with packs off a match plays exactly as before.

## Testing (from the first slice)

Tests are written alongside the code in every slice, not afterwards. A slice is not done until its tests exist and pass.

- **Test runner:** Vitest for shared, server and client logic. One root command (`npm test`) runs everything; `npm run typecheck` runs the TypeScript compiler in check mode. Playwright for browser smoke tests.
- **Simulation is pure and deterministic.** Game rules live in plain functions that take state, input and a time step, and return new state plus events. No randomness without the seeded generator.
- **Write the test first** for each game rule: describe the expected behaviour in the test, see it fail, then implement.
- **What to test per area (Stage 0 tests stay as they are):**
  - Rules: every Stage 0 rule, including its edge cases.
  - Room logic: code generation and uniqueness, joining by code, wrong code, full room, role selection conflicts, reconnection, leaving mid-match, the host-only rules.
  - Input handling: stick dead zone and direction maths, input send rate, laptop key and mouse mapping.
  - Event log: each event type is written with the required fields; the summary script gives correct numbers on a small hand-made sample log.
- **Stage 1 tests:**
  - Spawning: the same seed gives the same spots and types; never more packs than the limit; the signal lasts the set time before the pack appears; occupied spots are skipped; a replacement is signalled after the set delay; packs off means no spawns at all.
  - Slot: pickup by sailing over; no pickup while holding; pack used once; pack lost on sinking; health doesn't use the slot, isn't taken at full health and never heals above full.
  - Pack button: only the right role can use each pack; input from the wrong role is ignored.
  - Mine: drops behind the stern; no effect before arming; hits any ship after arming, including its owner; expires on time; damage correct.
  - Torpedo: leaves along the ship's heading at the moment of firing; speed and damage correct; stopped by the island and the map edge; shield halves damage.
  - EMP: catches enemy ships within the radius and no others; the firing ship is unaffected; caught ships can't fire, boost or shield for 3 s but can steer; the effect ends on time.
  - Host toggle: only the host can change it; it applies from the next match; with packs off, a match is identical to Stage 0 for the same seed and inputs.
  - Event log and summary: every Stage 1 event type with its fields; summary figures correct on a hand-made sample log with packs.
  - Browser smoke tests: extend the existing Playwright tests so a pack can be picked up and used on the laptop and the emulated phone.
- Tests and type-check must pass before every commit. Never delete or weaken a test to make it pass; ask instead.

## Build order for Stage 1

Work through these slices in order. Each one follows the rules above: plan, go-ahead, build with tests, summary, stop. Each pack slice is end-to-end (simulation, server, client, log and tests) so it can be tried on its own.

1. **Pack basics.** Spawn spots, the signal glow, spawning with the seeded generator, pickup, the shared slot shown on both crewmates' screens (top bar on phones and laptops), packs lost on sinking, the Pack button on both controllers and the E key (lit or dim; nothing to use yet), the **health pack**, the host **Packs on / off** toggle, and their log events.
2. **Mine.** Drop, arm, trigger on any ship including the owner, expire; pilot's Pack button and E key; log events.
3. **Torpedo.** Fire along the heading, travel, hit, shield halving, stopped by island and edge; gunner's Pack button and E key; the vibration on Android; log events.
4. **EMP.** Fire, catch enemies in range, disable fire, boost and shield for 3 s; the ring and the disabled look; log events.
5. **Summary script additions** as listed in "Match event log", with tests on a hand-made sample log.
6. **Home network play.** Run everything in Docker on the laptop; play from phones over the Wi-Fi; clear the three "still to verify" items from Stage 0; fix only what blocks a full match. Then hand over for the combined playtest.
7. **Changes after the check matches** (added 2026-10-25 at the user's request): packs nobody picks up disappear, players can leave a seat, two pack slots per ship (pilot and gunner).

## Stage 0 (done)

Stage 0 built the core crew game (Sink Count, 2 ships, 4 players, pilot and gunner, shared energy, one island, laptop and phone controls, match flow, event log, Docker on the home network) in 10 slices: environment check, project skeleton, rooms by code, simulation core, server loop, client rendering and laptop controls, phone controls, match flow, match event log and summary script, home network play. Its rules and controls above still apply.

## Definition of done for Stage 1

1. Four people on the home Wi-Fi can play full 4-minute Sink Count matches with packs on and with packs off, on phones and laptops.
2. All four packs spawn, can be picked up and used by the right role, and behave as described; the pack slot and Pack button are clear on every device.
3. Every match writes an event log including pack events, and the summary script reports the Stage 1 figures.
4. Every slice's tests pass (including all Stage 0 tests), type-check is clean, and every decision made along the way is recorded in `NOTES.md`.
5. **Combined playtest (Stage 0 + Stage 1),** recorded in `docs/playtest.md`: at least 3 rounds with packs off, then at least 3 rounds with packs on, with the same players. For each round note: did crews talk to each other, laugh, and ask for another round? With packs on, also note whether there were "line it up… now!" moments, and which packs people chased or ignored. Compare the notes with the log summaries for both sets of rounds.
