# Sink or Sail

A standalone, browser-based 2D naval battle game. Up to 10 two-person ships (20 players). Each ship has a **pilot** and a **gunner**. Players join from phones or laptops with a room code — no accounts.

Full design: `docs/design.md` (exported from the "Sink or Sail — Game Design" doc). Visual mock-ups: the Sink or Sail look-options canvas on claude.ai (sea-chart look, lobby screens, phone controllers). This file covers what Claude Code needs to build now; `docs/design.md` describes the whole game, including later stages — use it for context, not as a to-do list. When the two disagree, ask.

## Progress (updated 2026-10-26)

- **Stage 0 is built** (all 10 slices).
- **Stage 1 is built and committed** (8 slices: pack basics and health, mine, torpedo, EMP, summary script additions, home network play; slice 7, changes after the check matches: unpicked packs disappear, leaving a seat, two pack slots; slice 8, a third ship: up to 3 crews and 6 players, Frigates only). Slice 6 ran five packs-on check matches in Docker over the Wi-Fi, two of them with 4 players. The **combined playtest is deferred, still owed** (2026-10-26).
- **Stage 2 is planned** (2026-10-26). **Slice 1 is built and committed** (2026-10-26, `57029bf`): mode choice and Last Afloat. **Slice 2 is built and committed** (2026-10-26): nine island layouts, a host Layout dropdown with Random. **Slice 3 is built and committed** (2026-10-26): the host's Hazards on/off toggle and reefs (None / Few / All). **Slice 4 is built and committed** (2026-10-26): shipwrecks (solid until shot, rammed or blasted to pieces; half of them hold a pack, shown by a glint). **Slice 5 is built and committed** (2026-10-26): the closing storm (Last Afloat with hazards on). **Slice 6 is built and committed** (2026-10-26): the hazard timer and the moving storm (both modes, hazards on). **Slice 7 is built and committed** (2026-10-27): the whirlpool. **Slice 8 is built and committed** (2026-10-27): the kraken. **Slice 9 is split in two** (9a ghosts, 9b haunting); **9a is built and committed** (2026-10-27): ghosts (Last Afloat; only in 3-ship matches, since a 2-ship match ends at the first crew out). **9b is built and committed** (2026-10-27): haunting (zones, meters, fog, hazards set off by haunting). **Browser-test reliability** (2026-10-27): the browser tests draw on the graphics chip, at 20 frames a second, 2 at a time; 5 clean full runs in a row.
- **Tests now:** 1087 unit tests (plus 1 skipped: the mirror check for One Island, which is today's irregular island) and 37 browser tests, type-check clean. The last full run (the page fix) failed only a phone test waiting for the sea's first frame (see the watch item). Browser runs still fail sometimes under load (see the watch item).
- **Stage 2 slice 10 is planned** (2026-10-27): **part 1 is built and committed** (summary additions, Stage 2 playtest sheet in `docs/playtest.md`). Part 2 (the five home-network check matches) and the Stage 2 playtest are **deferred, still owed** (2026-10-27), like the Stage 1 combined playtest.
- **Stage 3 is planned** (2026-10-27; see "Current goal: Stage 3" below, answers in `NOTES.md`). **Slice 1 is built and committed** (2026-10-27): changing your name, unique names, the QR code, the remembered name. **Slice 2 is built and committed** (2026-10-27): the crew-based lobby (pairing on joining, Find me a partner, Leave this crew, Ready; the seat grid is gone). **Slice 3 is built and committed** (2026-10-27): late joiners wait for the next round on a waiting screen (pair up, pick a role, watch the match). **Slice 4 is built and committed** (2026-10-27): a lifebar above every ship. **Slice 5 is built and committed** (2026-10-27): the results table (place, crew, sinkings, time afloat, lives), Play again, back to the lobby after 20 s. **Slice 6 is built and committed** (2026-10-27): pack icons (sea, top bar, Pack button). **Slice 7 is built and committed** (2026-10-28): awards (all 17, at most one per crew, under the results; logged and in the summary). **Slice 8 is built and committed** (2026-10-28): the spectator view (Watch, Watch instead, Play next round; up to 6 players plus 4 spectators). **Slice 9 is built and committed** (2026-10-29): partner bots (Play with a bot, Remove bot, a joiner takes the bot's place; the bot gunner and bot pilot run on the server; a few choices made while building are marked "to confirm" in `NOTES.md`). **Slice 10 is built and committed** (2026-10-29): bot ships (the host's Bot ships setting 0–2; they fill the crews after the players' and give way to them; no ghost, no awards; a match of bots only for a host who watches). **Slice 11 is planned** (2026-10-29; answers in `NOTES.md`). **Part 1 is built and committed** (2026-10-29): bots, bot ships, the Bot ships setting and spectators in the match log and the summary; a spectator's Play next round logged; "1 life" in the summary; the Stage 3 playtest section in `docs/playtest.md`. Part 2 (the five check matches in Docker over the Wi-Fi, run by the user) and the Stage 3 playtest are **deferred, still owed** (2026-10-29), like the Stage 1 and Stage 2 check matches and playtests; when the user has run them, check their logs and summaries (Stage 3's definition of done waits on them).
- **Stage 4 is planned** (2026-10-29; answers in `NOTES.md`). Art is drawn in code and SVG, with system fonts and all sound generated in the browser. Tuning waits for a playtest, cloud hosting and logs online are decided later, and the spectator delay moves to Stage 5. Add to Home Screen, control hints and the 667 px fix come in. No definition of done is set yet. Slices: 1 countdown beeps and the speaker switch; 2 sound effects; 3–5 sea-chart look (sea and islands; ships and packs; hazards); 6 styled lifebar and visible damage; 7 sea-chart look for the screens and top bar (667 px fix); 8 first-match control hints; then tuning (after a playtest) and cloud hosting once decided; Add to Home Screen last (moved to the end, 2026-10-30). **Slice 1 is built and committed** (2026-10-29): the countdown beeps (3-2-1-Go, 1:00, last 10 s, horn) as browser tones, and the 🔊/🔇 switch in the top bar, remembered per device. **Slice 2 is built and committed** (2026-10-29): sound effects, made by the browser from cues the server sends each tick. Your own ship's sounds play at full volume and others' at half, and own-crew sounds go to that crew only. At most one of each kind every 60 ms and 8 at once. **Slice 3 is built and committed** (2026-10-29): the sea-chart look for the sea, islands, reefs and wrecks. It has pale chart-blue sea with an ink grid, wave squiggles and a compass rose, sand islands with an inked coast, dotted shallows and palms, reefs with the chart's rock marks, and tan wrecks with a mast. It is drawn once per match on a layer of its own, and the white marks are now ink. **Slice 4 is built and committed** (2026-10-29): ships, turrets, ghosts, packs, shots, mines and torpedoes in the sea-chart look. Ships have the mock-up's rounded hull, cream planks, a cream crew symbol and an ink turret. Crew colours are chart-toned (`#C9782A`, `#B0407A`, `#2A7F78`). Your own ship has a dashed ring. Packs are cream shapes with ink icons, shots are ink dots with a trail, and armed mines have a red ring. **Slice 5 is built and committed** (2026-10-29): storms, whirlpool, kraken and haunted zones in the sea-chart look. The closing storm has a brown-black wash with diagonal ink hatching. The moving storm is a dark inked cloud with cream swirls, and the whirlpool has ink spiral arms. The kraken is an ink-outlined sea-green sea monster, and haunting is darkening ink smudges. **Countdown fix** (2026-10-29): the 3-2-1, the layout banner and the countdown beeps run on their own animation-frame loop from the room state, so they don't wait for the sea to load. Before, the scene's first frame came at 2.8 s with Chrome 20× slower. This was the cause of the smoke test's missed 3-2-1; a new "slow device" browser-test group checks it. **Slice 6 is built and committed** (2026-10-30): a styled lifebar (cream with an ink outline, chart-toned green, amber and red, ticks at 25% and 50%) and visible damage below 25% of full health (ink cracks, flames, smoke trailing from the stern; hidden with the ship in a moving storm). **Slice 7 is built and committed** (2026-10-30): the sea-chart look for the join, lobby (two columns on wide screens), waiting, spectator, results and pause screens, the top bar (a cream strip, the role tag in the crew colour) and the phone controls. It also has the **667 px fix**: the top bar tightens on small screens and the energy bar keeps at least 120 px. **Slice 8 is built and committed** (2026-10-30): first-match control hints. Phones get cream labels by each control, laptops one line of keys, and ghosts a steering hint. Each goes once its control is used on the device (remembered), fades after 30 s, and "Hide hints" clears them. **The page doesn't wait for the sea** (2026-10-30): the top bar, phone controls, overlays, hints and results update on the countdown's own loop, not the scene's frames. A test-only `?sceneDelay=…` page setting makes the "slow device" test deterministic. Add to Home Screen moved to the end of Stage 4 (2026-10-30). **Tuning from the logs already in `logs/`** (user's choice, 2026-10-30, instead of waiting for a playtest): 67 test-run logs that had leaked into `logs/` are moved out, Vitest can no longer write there from any folder, and a tuning report (a private published page) comes first; changes only those the user picks from it. The report is published; the user felt boats were too slow to dodge hits, but chose to leave every value as it is and run more test games first (options in `NOTES.md`). **Cloud hosting moved to the last slice of Stage 5** (user's choice, 2026-10-30; its open questions in `NOTES.md`). Left in Stage 4: tuning (after the user's test games) and Add to Home Screen.

Every decision, with its date, is in `NOTES.md`.

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
- Slice 8 (a third ship): 3 ships when someone sits in Crew 3 as the match starts, otherwise 2 (so 4-player play is unchanged); up to 6 players; Crew 3 is teal ▲ and closed during a match that started without it; 3-ship starts on an equal-sided triangle centred on the island, with their own 6 pack spots repeating every 120°; still 2 packs on the map.
- Slice 7 (after the check matches): packs nobody picks up disappear 45 s after appearing (blinking for the last 5 s); a player leaves a seat by tapping it again or with **Leave seat** (not during a match); **two pack slots per ship**, a pilot slot (mine) and a gunner slot (torpedo or EMP), shown as `Packs: M · T` in the top bar.

**Main Stage 2 decisions so far** (planning and slice 1, 2026-10-26; full list in `NOTES.md`):
- Modes: the host picks **Sink Count** (default) or **Last Afloat** in the room screen, with two buttons; lives 1–5 (default 2) in a dropdown shown only for Last Afloat; host only, between matches.
- Last Afloat: each sinking costs a life, respawn as in Sink Count between lives; on the last life the ship is **out** (its crew watches until ghosts arrive in slice 9). The last ship in the match wins; going out together is a draw. **7:00 time limit** (moved into slice 1 from slice 5): most lives left wins, then most health, otherwise a draw. Every crew with a ship needs a player to start.
- "Sunk by…" banner names the cause ("Sunk by ■ Crew 2's guns / mine / torpedo", "Rammed by ■ Crew 2", "Sunk by your own mine"); a crew that is out keeps "Out: …". The top bar shows lives as hearts ("● ♥♥ – ■ ♥", "out").
- Hazards (later slices) come in **both modes**, on a **seeded timer**, with ghosts making them come sooner; a host **Hazards on / off** toggle (default on). Ghosts on a laptop: both crewmates steer with WASD.
- **To confirm with the user** (chosen while building slice 1): the banner keeps the crew symbol; the summary's "Sunk by" column counts times each crew was sunk, by cause; with 2 ships the "Out: …" banner only shows in 3-ship matches (the last sinking ends a 2-ship match at once).

**Discussed ahead of time (not to build yet)**, all recorded in `NOTES.md` under "Later" (2026-10-25); the first three are also reflected in the roadmap rows below:
- **Ship types** (Stage 5): five types with approved starting values. Whether types move earlier than Stage 5 is decided after the Stage 1 playtest.
- **Island layouts** (Stages 2 and 5): hand-made, mirrored layouts of 1–4 islands, differing between matches and picked by the host or Random. Today's single-island map stays the default. Stage 2 gets a few fixed layouts; Stage 5 gets layouts that scale with the map.
- **Countdown beeps** (Stage 4 unless moved earlier): a double beep at 1:00, beeps over the last 10 s, beeps for the 3-2-1-Go countdowns, and a per-device sound switch in the top bar. Whether to bring them earlier is decided after the Stage 1 playtest, depending on whether players kept checking the clock (a column on the playtest notes sheet).
- **QR code for joining from a phone** (added 2026-10-27): moved into Stage 3 and built in slice 1.
- **"Add to Home Screen"** (no stage set): a web app manifest so the game opens from a home-screen icon without the browser's address bar. It gives true fullscreen on Android; on iPhone it only hides Safari's bars, since iPhone pages still can't go fullscreen and no browser allows fullscreen without a tap.

**Stage 0 verify items:** all done (time zone 2026-10-24; phone reload and a full 4-player match 2026-10-25).

**Watch items:**
- ~~On 667 px phones, the top bar squeezes the energy bar.~~ Fixed in Stage 4 slice 7 (2026-10-30), with a browser test.
- No pack was used in any of the five slice 6 check matches; players didn't try. Is the Pack button being noticed? (For the playtest.)
- **New players on phones (2026-10-28):** in a home match a child playing gunner on a phone fired 2 shots in 4 minutes and never shielded or used a pack, with no fault reported (VVGW, `NOTES.md`). Are the gunner's phone controls clear enough for a first-timer? (For the playtest; a "first-match control hints" idea is under Later.)
- Load-related browser-test failures (slice 8): fixed 2026-10-26. The steering helper read positions late on a busy machine, and a ship arriving side-on circled its target. It now eases off near the target and goes round again when off course; the countdown allowance is 10 s. If a steering test fails again, check the test server's log for a ship circling its target. **Back with Stage 2 slice 1** (14 browser tests): at the default 4 tests at a time, 3 of 6 full runs had a failure (steering lost to load again; also once the 3-ship test's game view taking over 5 s to appear). Running 2 at a time passed 2 of 2 runs in about the same time (2.7–3.1 min). The user chose to commit without changing it and keep watching. (The "4 at a time" measurement before the helper fix was the default, so fewer at once was never actually tried then.) **Stage 2 slice 3** (16 browser tests): 4 of 7 full runs had one failure (3-ship game view slow to appear, EMP steering); not caused by reefs (turning hazards off in those tests didn't help). **Stage 2 slice 4** (17 browser tests): all 5 full runs had a failure (EMP test 3 times, 3-ship game view once, the new wreck test's game view twice before its first wait went to 15 s, once the laptop mine-pack ship overshooting); the failing tests pass alone, and none was caused by wrecks. **Stage 2 slice 5** (18 browser tests): 3 of 4 full runs had one failure (the reef test's samples jumping the reef stretch, the new storm test before its middle wait went to 15 s, and the Last Afloat test's enemy ship circling its target, bumping One Island's wrecks on the way); the fourth run passed. The user chose to leave the Last Afloat test as it is. **Stage 2 slice 6** (19 browser tests, a third test server): none of 5 full runs passed (1–3 load failures each, in the mine-pack, EMP, 3-ship, phone-aiming and pause/exit tests; also with 2 at a time); the new moving-storm test passed every time and the failing tests pass alone. Neither closing the user's browser nor switching the third test server off helped. The user chose to raise the 3-ship test's game-view wait to 15 s; the next full run passed 19 of 19. **Stage 2 slice 7** (20 browser tests): 3 full runs, each with 2 load failures (reef NaN speed twice, EMP twice, laptop and phone mine-pack once each); the new whirlpool and moving-storm tests passed every time. **Reliability slice (2026-10-27):** the cause was the test machine's load (10–12 game pages at once filling 8 cores, mostly Chrome drawing in software). Now: Chrome draws on the Iris Xe (Vulkan launch settings), test pages draw at 20 frames a second (`?fps=20`), 2 tests at a time, and the reef test records positions in the page. 5 clean full runs in a row, about 3–3.5 minutes each. If failures come back, check the load first (`uptime` during a run) and whether WebGL still reports the Iris Xe. **Stage 3 slice 9** (30 browser tests): none of 4 full runs passed, each with 1 load failure (the first smoke test missing the 3-2-1 three times, then a phone test's Fire button late). The failing tests pass on their own, nothing lingers after the new bot test, and the 27 "main" tests passed without it. Peak load 23–38 (the user's browser was busy too). The game view appeared 0.4 s after Start, but the countdown on it updated late. The user chose to commit as it is (2026-10-29). **Stage 4 slice 1** (32 browser tests): both full runs failed only that smoke test, the game view appearing after the 3-2-1; committed as it is, to investigate later (`NOTES.md`, Later). **Stage 4 slice 3:** the same failure in its one full run (the later groups then passed on their own); committed as it is. **Stage 4 slice 4:** that failure plus the whirlpool test's ship not reaching the eye in 60 s (peak load 29); both passed alone; committed as it is. **Stage 4 slice 5:** the smoke test and the layouts test (its countdown-only banner) both missed the countdown; committed. **Countdown fix (2026-10-29):** the cause was the countdown waiting for the scene's first frame. Fixed, with a new "slow device" group. Its last full run had only the kraken and whirlpool steering tests fail, at peak load 52 with the user's browser busy. **If browser tests fail, check `uptime` and what else is using the CPU first.** **Stage 4 slice 6:** one failure, a phone gunner test's Fire button later than 5 s (probably the controls waiting for the scene; `NOTES.md`, Later); committed as it is. **Stage 4 slice 7:** both full runs (peak load 32 and 34) failed only the sound test, which missed a 3-2-1 count when the page's frames came over a second apart; it passes alone; committed as it is. **Stage 4 slice 8:** one failure, the laptop mine-pack test's top bar filled in later than 5 s (peak load 28); the top bar and controls then stopped waiting for the scene (2026-10-30). That fix's full run failed only a phone test waiting over 5 s for the sea itself (the scene starting late; `NOTES.md`, Later: keep the scene between matches).
- Flaky browser tests (slices 5–6): explained in slice 7. The steering helper gives up quietly after 40 s, so a slow test ship that never reached its pack made the next top-bar check fail. If a pack test fails again, check the test server's log (in the temp folder `sink-or-sail-test-logs`) for a `packExpired` before the pickup.

**Stage 2 is planned** (2026-10-26, see "Current goal: Stage 2" below; answers in `NOTES.md`) and under way (slice 1 done). The Stage 1 combined playtest (`docs/playtest.md`) is deferred, still owed; the decisions waiting on it stay as planned (ship types Stage 5, beeps Stage 4, the Pack-button watch item).

**Where things are:**
- `shared/src/`: `tuning.ts` (every gameplay and client number; CLAUDE.md's "`shared/tuning.ts`"), `rooms.ts` (room rules, message names), `input.ts` (input validation), `packRules.ts` (who uses each pack, labels, when the Pack button is lit), `sim/` (pure, deterministic simulation; `layouts.ts` the nine island layouts, their reefs, wrecks and Random; `wrecks.ts` wreck hulls, packs and ramming; `storm.ts` the closing storm; `results.ts` places and time afloat; `awards.ts` the award tally, rules and pick; `bots.ts` the partner bots' pilot and gunner; `hazards.ts` the hazard timer, the moving storm, the whirlpool and the kraken; `ghosts.ts` ghosts (haunting zones and meters are in `hazards.ts`); `step()` returns the new world plus events; `packs.ts`, `mines.ts`, `torpedoes.ts`, `random.ts` seeded generator, `map.ts` spawn spots; `fixtures/stage0-run.json` is the Stage 0 reference recording that packs-off play must match).
- `server/src/`: `rooms/CrewRoom.ts` (room: codes, seats, host, match flow, 20 Hz loop), `rooms/crews.ts` (Stage 3 crew pairing, partner bots in crews), `rooms/matchFlow.ts`, `rooms/sync.ts`, `rooms/cues.ts` (sound cues), `log/` (match event log, `summary.ts`).
- `client/src/`: `lobby/` (plain HTML room screen, packs toggle, `crewList.ts` the crews and your crew, `waiting.ts` the waiting screen, `joinLink.ts` the QR code's link, `settings.ts` mode and lives), `game/` (`beeps.ts`, `sound.ts` and `soundSetting.ts` the countdown beeps and speaker switch, `sfx.ts` the sound effects' volume and mixer, `chartLook.ts` the sea-chart palette and decoration placement, `hints.ts` the control hints, Phaser scene, interpolation, laptop and touch controls, top bar, overlays, pack latch, EMP ring, pickup buzz).
- `e2e/`: Playwright smoke tests (laptop, emulated phone, pause/exit, stale page, leave seat, `packs.spec.ts` mine and torpedo, `emp.spec.ts`, `threeShips.spec.ts`, `lastAfloat.spec.ts`, `layouts.spec.ts`, `reefs.spec.ts`, `wrecks.spec.ts`, `storm.spec.ts`, `movingStorm.spec.ts`, `whirlpool.spec.ts`, `kraken.spec.ts`, `ghosts.spec.ts`, `bots.spec.ts`, `sound.spec.ts`, `slowDevice.spec.ts`, `hints.spec.ts`; shared `helpers.ts`).
- `docs/playtest.md`: the combined playtest guide and notes sheets, and the Stage 2 playtest section.

**Commands:** `npm test` (Vitest, then Playwright smoke tests with the installed Chrome), `npm run test:unit`, `npm run typecheck`, `npm run build`, `npm start` (port 2567), `npm run summary -- logs/<file>.jsonl`. Docker: `sudo docker compose up --build -d` (or `sudo HOST_IP=$(hostname -I | cut -d' ' -f1) docker compose up --build -d` so a laptop page on localhost can show the QR code), **in a normal terminal**; the `!` prompt has no terminal, so `sudo` can't ask for the password.

**Conventions to keep:**
- The server runs `.ts` directly through Node 22's type stripping: no enums, parameter properties or namespaces (`erasableSyntaxOnly`), and imports use `.ts` extensions.
- Colyseus 0.18 with the `schema()` builder, no decorators. Only the needed Colyseus packages, not the all-in-one `colyseus` (security advisories).
- Exact version pins; ask before adding any dependency.
- Server test files run one at a time (they share a port). Tests log to a temporary folder via `LOG_DIR`, never to the real `logs/`; under Vitest the server falls back to that temporary folder even without `LOG_DIR` (2026-10-30), but still run Vitest from the repo root.
- `MATCH_SEED` fixes every match's seed (used by the browser tests: port 2577 with seed 367 for mine and torpedo, port 2578 with seed 8 for the EMP). `STORM_STARTS_AT` and `STORM_CLOSED_AT` (test servers only) make the closing storm close sooner; port 2578 uses 2 and 12. `HAZARDS_FIRST_AT` (seconds, or `never`; test servers only) sets when the first dynamic hazard comes: 2577 and 2578 use `never`, the third to fifth test servers (port 2579, seed 14, a moving storm first; port 2580, seed 3, a whirlpool first; port 2581, seed 8, a kraken first) use 2. Adding a hazard kind changes which kind each seed draws, so these seeds need checking then. `JOIN_ADDRESS` (the laptop's address for the QR code; port 2577 uses the documentation-only `192.0.2.10`). `TEST_SINK` ("crew@seconds"; test servers only) sinks that crew's ship at that time; the sixth test server (port 2582) uses `2@4` for the ghost test, with `HAZARDS_FIRST_AT=999` so haunting is on.
- Browser tests seat players with `seatAs(page, crew, role)` (`e2e/helpers.ts`): players are paired into crews as they join (1st and 2nd make Crew 1, 3rd starts Crew 2, …), so call it in an order where the seat wanted is free.
- Pack presses are latched on the client and server so quick taps aren't lost; the E key also uses a key-down listener.
- Browser tests run in four groups, one after the other: "main" (2 at a time), then the many-page "three ships" and "ghosts" tests and the "slow device" test (Chrome slowed 20×, Stage 4) on their own (a group runs only when the one before passed; to run one file from a later group, add `--no-deps`). Chrome draws on the laptop's graphics chip (`--use-angle=vulkan` and friends in `playwright.config.ts`), pages open `GAME_PAGE` ("/?fps=20", a test-only frame limit read by `client/src/game/frameLimit.ts`), and 2 tests run at a time. The "slow device" test also adds `sceneDelay=4000` (test-only, same file): the scene starts that much later.
- Phaser's own touch input is off (`input: { touch: false }`). Our touch layer handles all touch; Phaser's window-wide touch listener made aiming fire the gun.

## Roadmap (for context only — do not build ahead)

`docs/design.md` was updated on 2026-10-25 and now has six stages (0–5). Stages 0 and 1 are below. The rest, as currently planned:

| Stage | What's in it | Question it answers |
| --- | --- | --- |
| 2 · The sea fights back | Reefs, wrecks, whirlpool, kraken, moving and closing storm, ghosts, Last Afloat, a few hand-made, mirrored island layouts (1–4 islands, or many small rocks), picked by the host or Random | Do hazards and ghosts keep sunk crews involved? |
| 3 · Full lobby | All lobby screens, bots (including a bot partner for a solo player), results and awards, spectator view (also usable by a host who only hosts and doesn't play), a **simple** lifebar for each ship, changing your name in the lobby before a match | Can a group get playing within 30 seconds? |
| 4 · Polish and online | Sea-chart art, sound, countdown beeps (1:00 warning, last 10 s), tuning (after a playtest), a **styled** lifebar to match the art, flames, smoke or visible damage on a ship whose health drops below 25% of full; also (2026-10-29) "Add to Home Screen", first-match control hints, the 667 px top bar fix | Is it ready for people outside the house? |
| 5 · More ships | Up to 10 ships (20 players; 3 ships already from Stage 1 slice 8), Fleet Battle, rooms and seats, 10 crew colours with symbols, map size scaling with the number of ships, a camera that follows your ship and a minimap on larger maps, more start, respawn and pack spots, respawn away from all enemies; the spectator delay for online play (moved from Stage 4, 2026-10-29); **five ship types** (Frigate, Cutter, Ironclad, Gunboat, Long gun) differing in health, size (which sets speed and turning), rate of fire, damage, gun range and energy, picked by the pilot before each match (details and starting values in `NOTES.md`, "Later"); island layouts that scale with map size and the number of ships; **cloud hosting with logs online, as the very last slice** (moved from Stage 4, 2026-10-30) | Does the game hold up with up to 10 ships? |

- The game stays at **2 or 3 ships** (Frigates only) until Stage 5; the third ship came early, in Stage 1 slice 8.
- **Known open question for Stage 2:** with 2 ships, Last Afloat ends at the first sinking, so ghosts get no time. The approach (for example extra lives per ship before a crew becomes a ghost) will be decided when Stage 2 is planned. Don't solve it in code.
- When work on the current stage suggests something for a later stage (for example a lifebar would help now), note it in `NOTES.md` under "Later" and say so; don't build it.

## Current goal: Stage 3 — full lobby

Answer one question: **can a group get playing within 30 seconds?** Build on Stage 2 without changing how a match plays. Planned with the user on 2026-10-27 (answers in `NOTES.md`). Stage 2's check matches and playtest, and the Stage 1 combined playtest, are deferred, still owed, and can run alongside Stage 3 testing.

### Stage 3 scope (in)

Following the lobby mock-ups (Join, Crew and role, Host settings, Waiting) in **layout and flow**, in today's plain style (the sea-chart look is Stage 4):

- **Join screen:** room code (filled in from a QR code's link), your name, Join room; or Host a new room.
- **Changing your name** in the lobby before a match.
- **QR code** on the host's screen: the laptop's address and the room code, so phones scan instead of typing.
- **Crew-based lobby** (replaces the seat grid): your crew's colour is assigned automatically; you pick **Pilot** or **Gunner**; then **Find me a partner**, join a crew from the room's list, or **Play with a bot**. A **Ready** button per crew; the host sees "x of y crews ready" and can start anyway.
- **Host settings:** room code and QR code, mode, lives, packs, hazards and reefs, layout, **bot ships**, Start.
- **Waiting screen** for late joiners ("A match is under way": ships afloat, storm timer, others waiting); they set up their crew and join at the next round.
- **Bots:** a solo player picks a role and a bot takes the other (a friend replaces it from the next round); the host can add whole bot ships (still at most 3 ships). A bot pilot heads for packs and steers round islands, reefs and hazards; a bot gunner aims at the nearest enemy and shields when hit; they use packs. Decent, never brilliant. Bot crews don't become ghosts. Both modes.
- **Results and awards:** a winner banner and a results table (place, crew, sinkings, time afloat); 3–4 awards picked at random from those earned, at most one per crew (all 17 from `docs/design.md`); **Play again** (same crews and settings, when the host confirms) or **Back to lobby**, everyone back in the lobby after 20 s.
- **Spectator view:** **Watch** with the room code (live, no delay): the whole sea, the scoreboard, ships left, the storm and haunted zones; **Play next round** joins the next round. A host can host without playing.
- **A simple lifebar** above every ship (green, amber, red), the same for everyone.
- Stage 3 events in the match log (bots, spectators, awards) and the summary (built in slice 11 part 1).

### Stage 3 scope (out — do not build yet)

Fleet Battle, fleet numbers, map size, more than 3 ships, ship types (Stage 5); sea-chart art for the lobby and the game, sound and countdown beeps, cloud hosting, the spectator delay for online play, a styled lifebar, visible damage (Stage 4).

### Stage 3 starting values

As in Stage 2, each slice's plan proposes its values (bot reaction times and aim, results timings, award definitions, lifebar colours) and they are approved before building. Still open for the awards slice: what "Storm Chaser" counts, and the speed below which a ship counts as standing still ("Sitting Duck").

### Build order for Stage 3

Same rules as before: plan, go-ahead, build with tests, summary, stop.

1. **Changing your name and the QR code.**
2. **The new lobby screens and crew pairing** (Find me a partner, join a crew, Ready).
3. **The waiting screen and late joiners.**
4. **The lifebar.**
5. **Results screen, Play again, back to the lobby** (20 s).
6. **Pack icons** (added 2026-10-27 at the user's request, brought forward from Stage 4's art): our own SVG icons on the sea, in the top bar and on the Pack button; names on hover on laptops.
7. **Awards.**
8. **Spectator view.**
9. **Partner bots** (bot gunner and bot pilot).
10. **Bot ships.**
11. **Log and summary additions, then check matches** in Docker over the Wi-Fi.

### Definition of done for Stage 3 (proposed)

1. A fresh group gets from opening the page to playing within about 30 seconds, on phones and laptops, timed in a Stage 3 playtest recorded in `docs/playtest.md`.
2. Everything in scope works as described, including solo players with a bot partner, bot ships, spectators and late joiners.
3. Every slice's tests pass (including all earlier tests), type-check is clean, and every decision is in `NOTES.md`.

## Stage 2 — the sea fights back (built; check matches and playtest deferred)

Answer one question: **do hazards and ghosts keep sunk crews involved?** Build on Stage 1 without changing how it plays on the default map with hazards off. Planned with the user on 2026-10-26 (answers in `NOTES.md`); the Stage 1 combined playtest is deferred, still owed, and can run alongside Stage 2 testing.

### Stage 2 scope (in)

Everything in Stages 0 and 1 stays as it is. Stage 2 adds:

- **Mode choice:** the host picks **Sink Count** (default) or **Last Afloat** in the room screen; host only, applies from the next match (like the Packs toggle).
- **Last Afloat:** free-for-all; each ship has **lives** (host picks 1–5 in the room screen, shown only with Last Afloat; default 2 in `tuning.ts`). Between lives a sunk ship respawns as in Sink Count (3 s countdown, safe spot, 2 s protection). A ship with no lives left is out, and its crew becomes a ghost (until slice 9, it watches). The last ship afloat wins.
- **How Last Afloat ends:** the **closing storm** closes in from the map edge after a set time to a small safe circle; ships outside it lose health steadily. A **hard time limit** ends the match if more than one ship is still afloat: most lives left wins, then most health; otherwise a draw. The closing storm is Last Afloat only.
- **Island layouts** (built in slice 2): nine hand-made layouts in `shared/src/sim/layouts.ts`, of 1–4 islands or many small rocks (limit lifted 2026-10-26): One Island (today's map, the default), Twin Isles, The Strait, Four Rocks, Crossroads, The Wall, The Ring, Archipelago, Slalom. All but One Island are mirrored left↔right and top↕bottom. Each has its own 2-ship and hand-placed, roughly fair 3-ship starts and pack spots; all use the four corner respawn spots. Checked automatically: open water, channels at least 70 wide (a Frigate fits; in Stage 5 bigger types may not fit every channel), every spot reachable by a Frigate, 3-ship fairness. The host picks one or **Random** (seeded, never the previous match's layout).
- **Hazards on / off:** a host-only toggle in the room screen, **default on**, applies from the next match. With packs and hazards off on the default map, a match plays exactly as Stage 0.
- **Hazards, in both modes:**

| Hazard | Type | Effect |
| --- | --- | --- |
| Reef | Static | Passable, but slows the ship and deals a small hit |
| Shipwreck | Static | Destructible; sometimes holds a pack |
| Moving storm | Dynamic | Moves across the map, pushes ships and limits visibility |
| Whirlpool | Dynamic | Pulls ships in; skilled pilots can slingshot around the edge |
| Kraken | Dynamic | Roams and grabs the nearest ship |

- **Dynamic hazards** come on a **seeded timer** (same seed, same hazards, like packs); every one is signalled before it acts; at most one or two are active at once; they spawn near ships, never directly on them (from `docs/design.md`).
- **Ghosts and haunting** (Last Afloat): a crew that is out becomes **one shared ghost**. Phone: the stick, no buttons. Laptop: **both crewmates steer with WASD**. Either way the ghost follows whoever moved it last. Ghosts move freely, pass through everything, appear as faint dashed outlines and can't touch or block anyone. The sea is divided into zones, each with a hidden haunting meter that fills faster the more ghosts are in it; ghosts **make hazards come sooner** in the zones they haunt. A filling meter shows as thickening fog and darkening water, and each zone caps how often hazards can spawn there.
- **"Sunk by…" banner:** both crewmates see the cause ("Sunk by Crew 2's torpedo", "Taken by the kraken", "Lost to the storm"); text only, no long vibration. Slice 1 covers the Stage 1 causes (shot, mine, torpedo, bump); each hazard slice adds its own.
- Stage 2 events in the match event log and new figures in the summary script (see "Stage 2 log and summary" below).

### Stage 2 starting values

Every value goes in `shared/tuning.ts`. Unlike Stage 1, the numbers aren't agreed up front: each slice's plan proposes its values and they are approved before building. Already agreed: lives default 2 (host range 1–5); respawn between lives uses the Sink Count values. Still to propose, slice by slice: the layouts; reef slowdown and damage; wreck health and pack chance; closing-storm start, end, safe-circle size and damage; the time limit; moving-storm speed, push and visibility; whirlpool pull and size; kraken speed, reach and grab effect; the hazard timer; zone size, haunting rate and per-zone caps.

### Stage 2 scope (out — do not build yet)

Fleet Battle, bots, spectator view, awards, a results screen beyond the simple scoreboard, the lifebar, changing names in the lobby, final art (including the break-apart look), sound and countdown beeps, cloud hosting, more than 3 ships, ship types, layouts that scale with the map or are generated from the seed (Stage 5), and any obstacle from the "Potential add-ons" list in `docs/design.md` (sandbar, kelp, sea stacks and the rest).

### Stage 2 log and summary (proposed; each slice's plan confirms its events)

- **Match start** also records the mode, lives, layout and whether hazards are on; the summary header shows them (like Packs on/off).
- **Events:** life lost (ship, lives left); crew out (became a ghost); match ended by time limit (with the tie-break used); reef hit; wreck hit, destroyed, pack released; storm damage; hazard signalled, started and ended (type, spot); ship caught by a whirlpool; kraken grab; a zone's haunting meter setting off a hazard. Ghosts' positions about once a second, with the ship positions.
- **Summary**, per crew: finishing place and time afloat (Last Afloat); lives used; sinkings by cause; damage taken per hazard type; time as a ghost; hazards set off by haunting.

### Stage 2 tests (on top of the Testing section)

- Modes and lives: host-only choice, applies from the next match; lives count down and respawn as in Sink Count; out at zero; last ship afloat wins; time limit and tie-break; Sink Count unchanged.
- Layouts: every spot of every layout passes the automatic checks; mirrored layouts are mirror images; Random uses the seed; the default layout keeps the Stage 0 recording matching.
- Hazards: each hazard's effect and edge cases; the seeded timer gives the same hazards for the same seed; signalled before acting; never more active than the limit; never spawned on a ship; hazards off means none at all.
- Ghosts: control by the last crewmate to move it; can't touch, block or be hit; haunting fills by ghost count and brings hazards sooner, within each zone's cap.
- Banner: the right text for every cause.
- Event log and summary: every Stage 2 event with its fields; summary figures correct on a hand-made sample log.
- Browser smoke tests: the mode and lives choice, a Last Afloat match to its end, and a ghost steered on the laptop and the emulated phone.

### Build order for Stage 2

Same rules as before: plan, go-ahead, build with tests, summary, stop. Each slice is end-to-end (simulation, server, client, log and tests).

1. **Mode choice and Last Afloat:** the mode and lives settings, lives and respawn, out at zero (watching until slice 9), last ship afloat wins, the 7:00 time limit and tie-break (moved here from slice 5, 2026-10-26), the "Sunk by…" banner with the Stage 1 causes, log and summary.
2. **Island layouts:** nine hand-made layouts (One Island stays the default) with their own checked spots; host picks or Random.
3. **Hazards toggle and reefs.**
4. **Shipwrecks.**
5. **Closing storm** (Last Afloat), on top of slice 1's time limit and tie-break.
6. **Moving storm** (both modes, seeded timer).
7. **Whirlpool.**
8. **Kraken.**
9. **Ghosts and haunting.**
10. **Summary script additions and home-network check matches** in Docker over the Wi-Fi; fix only what blocks a full match.

### Definition of done for Stage 2 (proposed)

1. Four or more people on the home Wi-Fi can play full matches in both modes, with hazards on and off, on phones and laptops.
2. Every hazard, the closing storm, lives and ghosts behave as described, and the banner names every cause.
3. Every match's log includes the Stage 2 events, and the summary script reports the Stage 2 figures.
4. Every slice's tests pass (including all Stage 0 and 1 tests), type-check is clean, and every decision is in `NOTES.md`.
5. A Stage 2 playtest recorded in `docs/playtest.md`: Last Afloat rounds with hazards on and off. For each round, note whether sunk crews stayed involved as ghosts, which hazards people noticed, avoided or used, and whether they asked for another round.

## Stage 1 — packs (built; combined playtest deferred)

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

Reefs, wrecks, whirlpools, kraken, storm, ghosts, Last Afloat, Fleet Battle, bots, spectator view, awards, results screen beyond a simple scoreboard, final art, sound, cloud hosting, more than 3 ships (3 since slice 8), any pack not in the table above.

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
- **Pack icons (Stage 3 slice 6):** each pack shows its own icon (white SVGs in `client/public/icons/packs/`) inside its outline shape on the sea, in the top bar and on the Pack button; the letters are gone. Names on hover on laptops (top bar).
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
8. **A third ship** (added 2026-10-25 at the user's request): up to 3 crews and 6 players, Frigates only, with fair 3-ship starts and pack spots; 2-ship play unchanged.

## Stage 0 (done)

Stage 0 built the core crew game (Sink Count, 2 ships, 4 players, pilot and gunner, shared energy, one island, laptop and phone controls, match flow, event log, Docker on the home network) in 10 slices: environment check, project skeleton, rooms by code, simulation core, server loop, client rendering and laptop controls, phone controls, match flow, match event log and summary script, home network play. Its rules and controls above still apply.

## Definition of done for Stage 1

1. Four people on the home Wi-Fi can play full 4-minute Sink Count matches with packs on and with packs off, on phones and laptops.
2. All four packs spawn, can be picked up and used by the right role, and behave as described; the pack slot and Pack button are clear on every device.
3. Every match writes an event log including pack events, and the summary script reports the Stage 1 figures.
4. Every slice's tests pass (including all Stage 0 tests), type-check is clean, and every decision made along the way is recorded in `NOTES.md`.
5. **Combined playtest (Stage 0 + Stage 1),** recorded in `docs/playtest.md`: at least 3 rounds with packs off, then at least 3 rounds with packs on, with the same players. For each round note: did crews talk to each other, laugh, and ask for another round? With packs on, also note whether there were "line it up… now!" moments, and which packs people chased or ignored. Compare the notes with the log summaries for both sets of rounds.
