# Sink or Sail

A standalone, browser-based 2D naval battle game. Up to 10 two-person ships (20 players). Each ship has a **pilot** and a **gunner**. Players join from phones or laptops with a room code — no accounts.

Full design: `docs/design.md` (exported from the "Sink or Sail — Game Design" doc). Visual mock-ups: the Sink or Sail look-options canvas on claude.ai (sea-chart look, lobby screens, phone controllers). This file covers what Claude Code needs to build now; `docs/design.md` describes the whole game, including later stages — use it for context, not as a to-do list. When the two disagree, ask.

## Current goal: Stage 0 — core crew test

Answer one question: **is two people sharing one ship fun?** Build the smallest thing that tests it, then stop and playtest. Do not build later-stage features early.

### Stage 0 scope (in)

- 2 ships, 4 players, **Sink Count** mode only (4-minute match, most sinkings wins).
- Join by a 4-character room code; enter a name; pick pilot or gunner. Two crews, no lobby polish.
- Pilot: steer (with slight drift) + **Boost**.
- Gunner: aim a 360° turret independent of the ship's heading + **Fire** (separate button) + **Shield**.
- Boost and shield draw on **one shared energy bar** per ship, refilling over time.
- Hits damage the ship; at zero health it sinks, then respawns after **3 s** at a safe spot with **2 s** of protection.
- One island that blocks movement and shots.
- Laptop controls and phone controls (below).
- Placeholder art: simple shapes in crew colours on a blue background.
- Runs on a laptop in Docker; players connect over the home Wi-Fi.
- A match event log for later analysis (see "Match event log").

### Stage 0 scope (out — do not build yet)

Packs, mines, torpedoes, EMP, reefs, wrecks, whirlpools, kraken, storm, ghosts, Last Afloat, Fleet Battle, bots, spectator view, awards, results screen beyond a simple scoreboard, final art, sound, cloud hosting.

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
- Simple custom physics: ships as capsules or circles, shots as points, the island as a polygon. No physics engine.
- All tunable numbers (speeds, drift, energy costs, refill rate, damage, health, cooldowns) live in one `shared/tuning.ts` file. They are starting values to change during playtesting.

## Match event log

The server records each match for analysis and, later, for awards. Log events, not every tick.

- One file per match in `logs/` (mounted as a Docker volume so files survive restarts), named by date, time and room code, one JSON object per line (JSON Lines).
- Every event carries: match time in ms, event type, and where relevant ship id, player name and role.
- Stage 0 events: match start (crews, roles, tuning values in use) and end (scores); shot fired; hit landed (attacker, target, damage); shield raised and shot blocked; boost used; energy bar hit empty; ship sunk (by whom); respawn; player joined, left or reconnected.
- About once per second: each ship's position, heading, health and energy.
- Later stages add their own events (packs, hazards, ghosts, awards) in the same format.
- Logging must never slow the simulation: buffer writes and flush asynchronously.
- In-game names only; no other personal data. Files stay on the laptop.
- Add a small script that summarises a log: per crew sinkings, shots, hit accuracy, energy spent on boost vs shield, time spent with an empty bar, average survival time.

## Controls

### Laptop
- Pilot: WASD to steer, Space to boost.
- Gunner: mouse to aim, left-click to fire, right-click to shield.

### Phone (sideways only)
- **Left thumb, both roles:** a hybrid stick — visible resting spot, but it jumps to wherever the thumb lands on the left half of the screen. Small dead zone in the centre.
- **Right thumb, pilot:** large Boost button.
- **Right thumb, gunner:** large Fire button with Shield right beside it. They can't be pressed together; that's intended.
- Top of screen: role, crew, shared energy bar, score and timer.
- Support multi-touch (stick + button at once) with pointer events.
- Block browser gestures on the game screen: pinch-zoom, double-tap zoom, pull-to-refresh, text selection.
- Android: request fullscreen and lock to landscape. iPhone can't lock orientation from a browser: show a "rotate your phone" screen in portrait.

## Visual rules (apply even with placeholder art)

- Ships are top-down hull shapes (pointed bow), not circles, and point the way they are sailing.
- Every ship shows its turret direction. Only your own ship shows the aiming guide (dashed line, cone, crosshair).
- Crew colours must be clearly distinct; pair each with a symbol for colour-blind players.
- Each player sees the same amount of sea whatever their device, so laptops get no advantage.

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

## Testing (from the first slice)

Tests are written alongside the code in every slice, not afterwards. A slice is not done until its tests exist and pass.

- **Test runner:** Vitest for shared, server and client logic, unless current docs give a reason to ask about an alternative. One root command (`npm test`) runs everything; `npm run typecheck` runs the TypeScript compiler in check mode.
- **Simulation is pure and deterministic.** Put game rules (movement, drift, boost, energy, aiming, shots, collisions, damage, sinking, respawn, protection, scoring, match timer) in plain functions that take state, input and a time step, and return new state. No randomness without a seeded generator. This makes them fully unit-testable without a network or browser.
- **Write the test first** for each game rule: describe the expected behaviour in the test, see it fail, then implement.
- **What to test per area:**
  - Rules: every rule above, including edge cases (energy at zero, shield and fire not together, respawn timing, protection window, shots blocked by the island, ship cannot enter the island).
  - Room logic: code generation and uniqueness, joining by code, wrong code, full room, role selection conflicts, reconnection, leaving mid-match. Use Colyseus's own testing utilities if its current docs provide them; otherwise ask.
  - Input handling: stick dead zone and direction maths, input send rate, laptop key and mouse mapping.
  - Event log: each event type is written with the required fields; the summary script gives correct numbers on a small hand-made sample log.
- **Browser smoke test** (from the slice that adds rendering): one automated check that the client loads, joins a room and shows a ship. Ask which tool to use before adding it.
- Tests and type-check must pass before every commit. Never delete or weaken a test to make it pass; ask instead.

## Getting started: the build order for Stage 0

Work through these slices in order. Each one follows the rules above: plan, go-ahead, build with tests, summary, stop.

1. **Environment check.** Report installed versions of Node.js, npm, Docker and Docker Compose. Check current stable versions of Phaser, Colyseus, Vite and Vitest in their docs. Propose versions and ask before installing anything.
2. **Project skeleton.** `client/`, `server/` and `shared/` packages; TypeScript config; `npm test` and `npm run typecheck` working with one trivial passing test in each package; Docker Compose that runs the server and serves the client; empty `NOTES.md` with "Decisions" and "Later" headings; `.gitignore` (including `logs/`).
3. **Rooms by code.** Create a room and get a 4-character code; join by code with a name; pick pilot or gunner; two crews of two. Tests for every rule in "Room logic".
4. **Simulation core.** All Stage 0 game rules as pure functions in `shared/`, with every tunable number in `shared/tuning.ts`. Heavily tested. No rendering yet.
5. **Server loop.** The room runs the simulation at a fixed tick, applies player input, and broadcasts state. Tests that input changes state and that the server rejects anything other than input.
6. **Client rendering and laptop controls.** Draw the sea, island, ships (hull shapes, turrets, own aiming guide), shots and the shared energy bar; interpolate between snapshots; send laptop input at a steady rate. Add the browser smoke test.
7. **Phone controls.** Sideways layout, hybrid stick, role buttons, multi-touch, blocked browser gestures, fullscreen and landscape lock on Android, "rotate your phone" screen on iPhone. Tests for stick maths and input mapping.
8. **Match flow.** 4-minute timer, live score, sinking and respawn shown on screen, a simple end-of-match scoreboard, and starting a new match in the same room.
9. **Match event log and summary script.** As described in "Match event log", with tests.
10. **Home network play.** Run everything in Docker on the laptop, play from phones over the Wi-Fi, fix only what blocks a full match. Then hand over for the playtest.

## Definition of done for Stage 0

1. Four people on the home Wi-Fi can join one room by code, pick roles, and play a full 4-minute Sink Count match on phones and laptops.
2. Steering, boost, aiming, firing, shield, shared energy, damage, sinking and respawn all work and feel responsive.
3. Every match writes an event log, and the summary script runs on it.
4. Every slice's tests pass, type-check is clean, and every decision made along the way is recorded in `NOTES.md`.
5. Then playtest 5 rounds and record: did crews talk to each other, laugh, and ask for another round? Compare those notes with the log summaries.
