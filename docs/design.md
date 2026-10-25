# Sink or Sail — Game Design

Oct 23, 2026 · @JCCJ

## Overview

Sink or Sail is a standalone, browser-based 2D naval battle for up to 10 two-person ships (20 players). Each ship has a pilot and a gunner; crews sail a sea of obstacles and hazards, grab packs, and try to be the last afloat.

- **Design goals:** easy to join, low learning curve, battle royale and team modes from one core game.
- **Core loop:** sail, race for packs, fight other ships, survive the hazards and the closing storm.
- **Platforms:** phones and laptops, each player on their own screen, with an optional spectator view for a shared big screen.

## Crew and controls

Every ship has two roles, each with one stick and one button. Boost and shield draw on one shared energy bar, so the crew has to coordinate.

| Role | Stick | Main button | Pack button |
| --- | --- | --- | --- |
| Pilot | Steers the ship (with slight drift) | Boost | Drops mines |
| Gunner | Aims a 360° turret, independent of heading | Fire, with Shield beside it | Fires torpedoes, triggers EMP |

- **Phone:** each player sees only their own role's controls.
- **Laptop:** pilot uses WASD + Space; gunner aims with the mouse, left-click to fire, right-click for shield.
- **Aiming:** each player sees the aiming guide (dashed line, aiming cone, crosshair) for their own ship only; other ships show just their turret direction.

### Phone controller

- **Sideways only.** iPhones can't lock orientation from a browser, so they get a "rotate your phone" screen.
- **Left thumb, both roles:** a hybrid stick. It has a visible resting spot but jumps to wherever the thumb lands on the left half of the screen.
- **Right thumb, pilot:** a large Boost button and a small Pack button.
- **Right thumb, gunner:** a large Fire button, a Shield button beside it and a small Pack button. Fire and Shield can't be pressed together: shoot or block is a choice.
- **Top of screen:** role, crew, shared energy bar, ships left and storm timer.
- **Build notes:** multi-touch input, browser gestures blocked (zoom, pull-to-refresh, text selection), a small stick dead zone, and input sent at a steady 20–30 times a second.

Mock-ups are on the [Sink or Sail canvas](https://claude.ai/artifact/FLuXfCmELFG21y2rCCXoKY), under "Phone controllers".

## Modes

Three modes share the same ships, packs and map; they differ only in how a match is won and what happens when a ship sinks.

| Mode | Format | Length | Win condition | When sunk | Storm |
| --- | --- | --- | --- | --- | --- |
| Last Afloat | Free-for-all | Until one ship remains | Last ship afloat | Crew becomes ghosts | Closes in |
| Sink Count | Free-for-all | 4 minutes | Most sinkings | Respawn | None |
| Fleet Battle | Fleets by number; sizes can differ | Until one fleet remains | Sink every enemy ship | Crew becomes ghosts | Closes in |

Fleet Battle has friendly fire off.

## Packs

Packs spawn around the map from time to time; a ship sails over one to pick it up. The pilot aims every pack by positioning the ship, and the gunner fires the attacking ones.

| Pack | Effect | Aimed by | Fired by |
| --- | --- | --- | --- |
| Torpedo | High damage, slow; travels straight out from the bow | Pilot (ship's heading is the only guide) | Gunner |
| Mine | Dropped behind the stern only | Pilot (route) | Pilot |
| EMP | Disables weapons, boost and shield of ships in a radius for 3 s; steering still works | Pilot (ship position) | Gunner |
| Health | Repairs the ship | — | Applied instantly |

- **Two slots per ship:** one for the pilot's pack (mine) and one for the gunner's (torpedo or EMP). A ship can't pick up a pack while that role's slot is full, so it can hold a mine and a torpedo at once, but not two mines. The slots show what is loaded.
- **Signalled spawns:** a spot glows about 3 seconds before a pack appears, so crews race for it.
- **Packs nobody picks up disappear** after about 45 s (blinking near the end), so new packs keep appearing across the map.
- **More pack types** can be added later.
- **Stage 1 starting values** (to tune in playtesting): 2 packs on the map at once from about 6 fixed spawn spots, a replacement signalled about 8 s after one is taken, equal chance of each type. Mine arms after 1 s, lasts 30 s, deals 40% of full health and hits any ship including its owner. Torpedo is slower than a shot, deals 50% of full health, is halved by a raised shield and stopped by islands. EMP reaches about 3 ship lengths and affects enemies only. Health restores 40%, doesn't use a slot, and isn't taken at full health. Held packs are lost when the ship sinks. Laptop: E uses the pack for both roles. The host can switch packs on or off for a match.

## Map

Map size is set at the start of each match by the number of ships, around a medium map of about 2×2 screens (roughly 20 seconds to cross).

| Ships in match | Map size | Approx. crossing time |
| --- | --- | --- |
| 2–4 | One screen | 10–12 s |
| 5–7 | 2×2 screens, with minimap | \~20 s |
| 8–10 | Between 2×2 and 3×3 screens | 20–30 s |

Every player sees the same amount of sea, whatever their device, so laptops get no advantage over phones.

### Obstacles

Each obstacle has one distinct effect.

| Obstacle | Type | Effect |
| --- | --- | --- |
| Island | Static | Blocks movement and shots; works as cover |
| Reef | Static | Passable, but slows the ship and deals a small hit |
| Shipwreck | Static | Destructible; sometimes holds a pack |
| Whirlpool | Dynamic | Pulls ships in; skilled pilots can slingshot around the edge |
| Kraken | Dynamic | Roams and grabs the nearest ship |
| Storm / tornado | Dynamic | Moves across the map, pushes ships and limits visibility |

- Every dynamic hazard is signalled before it acts.
- At most one or two dynamic hazards are active at once.
- In Last Afloat and Fleet Battle, the storm also closes in from the map edge as the shrinking zone.

## Ghosts and haunting

Sunk crews in Last Afloat and Fleet Battle become ghosts (one shared ghost per crew): the more ghosts in an area, the more likely hazards are to trigger there.

- The sea is divided into zones, each with a hidden haunting meter that fills faster the more ghosts are in it. A full meter spawns a hazard in that zone.
- The meter shows as thickening fog and darkening water, so living crews can see danger building and leave.
- Ghosts move freely, pass through everything and appear as faint dashed outlines. They can't touch or block anyone.
- Hazards spawn near ships, never directly on them.
- Each zone has a cap on how often hazards can spawn, so ghosts can't pile onto one ship and decide the winner.

## Joining, bots and spectator view

A player should be in a match within about 30 seconds of opening the link: open the page, enter the room code, pick a name, play. No account is needed.

- **Bots:** a solo player picks their role and a bot fills the other. Bots are decent but never brilliant: a bot pilot heads for packs and avoids obstacles; a bot gunner aims at the nearest enemy and shields when hit. A human friend replaces the bot from the next round. Bots can also crew whole ships so small groups still get a full sea.
- **Spectator view:** any TV, laptop or projector joins with the room code and taps Watch. Small maps show the whole sea; larger maps use an automatic camera that cuts to the action. It shows the scoreboard, ships left, the storm and the haunted zones. A spectator can tap Play next round to join at the next round.
- **Online play:** the spectator view runs a few seconds behind live so it can't be used for scouting.

### Lobby rules

- **Crew colour:** assigned automatically.
- **Finding a crew:** pair with a friend from the lobby list, tap Find me a partner, or play with a bot. Each player picks pilot or gunner.
- **Fleet Battle:** each ship picks a fleet number from 1 to n−1, where n is the number of ships in the game. Ships with the same number form a fleet. Fleet sizes don't have to match, but at least two fleets are needed to start.
- **Host settings:** mode and number of bot ships; map size is automatic. The host starts the match and empty slots fill with bots.
- **Late joiners:** wait in the lobby and join at the start of the next round, setting up their crew while they wait.

Screen mock-ups are on the [Sink or Sail canvas](https://claude.ai/artifact/FLuXfCmELFG21y2rCCXoKY), under "Lobby and joining".

## Look and feel

The main look is a tabletop sea chart: a hand-drawn nautical chart on blue water, with inked islands and reefs and a kraken drawn like an old map's sea monster. Mock-ups are on the [Sink or Sail look options canvas](https://claude.ai/artifact/FLuXfCmELFG21y2rCCXoKY).

- **Ships:** top-down hulls with a pointed bow, deck planking and a central turret, in the crew's colour. Each ship points the way it is sailing; the turret shows where it is aiming.
- **Ghosts:** faint dashed hull outlines; haunted zones appear as smudged, darkening ink.
- **Screen overlay:** mode and ships left (top left), storm timer (top right), crew panel (bottom left) and minimap (bottom right). The crew panel and minimap are the same size, 150 × 96.
- **Readability:** 10 clearly distinct crew colours plus a flag or symbol per crew for colour-blind players. Ghosts must never be mistaken for living ships.

## Being sunk and end of match

### Being sunk

- Both crewmates see the ship break apart, feel a long vibration, and get a banner naming the cause ("Sunk by Red crew's torpedo", "Taken by the kraken", "Lost to the storm").
- **Last Afloat and Fleet Battle:** after about 2 seconds the screen fades to an inky look and the crew becomes **one shared ghost**. Either crewmate can steer the ghost with the stick, and it follows whoever touched last; there are no buttons; a small meter shows how haunted the current zone is. In Fleet Battle, surviving fleet-mates are highlighted.
- **Sink Count:** a 3-second respawn countdown, then the ship reappears at a safe spot with 2 seconds of protection.

### End of match

- A winner banner on every phone and the spectator screen.
- A results table: finishing place, crew, sinkings, time afloat.
- **Play again** (same crews and settings, starts when the host confirms) or **Back to lobby**; everyone returns to the lobby automatically after 20 seconds. Late joiners join from here.

### Awards

Each match shows 3–4 awards chosen at random from those earned, with at most one per crew.

| Award | Given for |
| --- | --- |
| Untouchable | Fewest hits taken |
| Sharpshooter | Most hits |
| Kraken's Favourite | Grabbed by the kraken most often |
| Ghost of the Match | Most hazards caused as a ghost |
| Mine, All Mine | Sunk by your own mine |
| Davy Jones' Express | First ship sunk |
| Rock Collector | Most reef scrapes |
| Bumper Boats | Most collisions with other ships |
| Sitting Duck | Most time stationary |
| Trigger Happy | Most shots fired, worst accuracy |
| Pack Rat | Most packs picked up |
| Hoarder | Held a pack longest without using it |
| Shield Hog | Most energy spent on shield |
| Speed Demon | Most energy spent on boost |
| Close Shave | Survived with the least health left |
| Storm Chaser | Most time inside the storm without sinking |
| Whirlpool Tourist | Most time caught in whirlpools |

## Build plan

JCCJ builds it with Claude Code in TypeScript and Node.js, in six stages (0–5); each stage answers one question before the next starts. The first trial is at home on the local network.

### Tech approach

- **Client:** [Phaser 4](https://cdn.jsdelivr.net/npm/phaser@4.2.1/README.md) (4.2.1 at time of writing) in TypeScript, for sprites, camera, touch and keyboard input, and sound.
- **Server:** Node.js with [Colyseus](https://colyseus.io/blog/colyseus-017-is-here/) (0.17 at time of writing), for rooms with join codes, state sync and reconnection.
- **Server-authoritative:** phones send only stick and button input; the server moves ships, resolves hits and hazards, and sends results back.
- **Physics:** simple custom code for drift, collisions and projectiles; no heavy physics engine.
- **Hosting:** Docker on a laptop on the home Wi-Fi for the first trial, Tailscale for remote testing, a small cloud server for public play later.

### Stages

| Stage | What's in it | Question it answers |
| --- | --- | --- |
| 0 · Core crew test | 2 ships (4 players), Sink Count only, pilot and gunner controls, shared energy, one island, join by room code, placeholder art | Is two people sharing one ship fun? |
| 1 · Packs | Mine, torpedo, EMP, health; signalled spawns | Do packs create "line it up… now!" moments? |
| 2 · The sea fights back | Reefs, wrecks, whirlpool, kraken, closing storm, ghosts, Last Afloat, a few hand-made, mirrored island layouts (1–4 islands), picked by the host or Random | Do hazards and ghosts keep sunk crews involved? |
| 3 · Full lobby | All lobby screens, bots, results and awards, spectator view (also usable by a host who only hosts and doesn't play), a simple lifebar for each ship, changing your name in the lobby before a match | Can a group get playing within 30 seconds? |
| 4 · Polish and online | Sea-chart art, sound, countdown beeps (1:00 warning, last 10 s) unless moved earlier, tuning, cloud hosting, a styled lifebar to match the sea-chart art, flames, smoke or visible damage on a ship whose health drops below 25% of full | Is it ready for people outside the house? |
| 5 · More ships | Up to 10 ships (20 players; 3 ships already from Stage 1): Fleet Battle, rooms and seats, 10 crew colours with symbols, map size scaling with the number of ships, a camera that follows your ship and a minimap on larger maps, more start, respawn and pack spots, respawn away from all enemies; five ship types (Frigate, Cutter, Ironclad, Gunboat, Long gun) differing in health, size (which sets speed and turning), rate of fire, damage, gun range and energy, picked by the pilot before each match; island layouts that scale with map size and the number of ships | Does the game hold up with up to 10 ships? |

### Stage 0 tasks

- [ ] Set up the project: a Phaser client, a Colyseus server and shared TypeScript types
- [ ] Room created and joined by a 4-character code; two crews; pilot and gunner roles
- [ ] Server simulation at a fixed tick: ship drift and boost, shared energy, turret aim, shots, shield, damage, sinking and 3-second respawn
- [ ] Client drawing: sea, one island, ships, turrets, shots, energy bar
- [ ] Laptop controls (WASD + Space; mouse aim, click to fire, right-click to shield)
- [ ] Phone controls held sideways: hybrid stick, role buttons, "rotate your phone" screen
- [ ] Run the server in Docker on the laptop and play over the home Wi-Fi
- [ ] Playtest 5 rounds: did crews talk to each other, laugh, and ask for another round?

### Match event log

From Stage 0, the server writes one log file per match for tuning, playtest analysis and, later, awards. It records events, not every frame.

- **Format:** JSON Lines, one file per match in a `logs/` folder on the laptop; in-game names only.
- **Stage 0 events:** match start and end, shots, hits, shield blocks, boost use, empty energy bar, sinkings, respawns, joins and reconnects.
- **Positions:** each ship's position, heading, health and energy about once a second.
- **Later stages** add packs, hazards, ghosts and awards in the same format.
- **Summary script** per match: sinkings, shots, hit accuracy, boost vs shield energy, time with an empty bar, average survival time. Read alongside the playtest notes.

* [ ] Stage 0: event log and summary script working

## Potential add-ons

None of these are in the current design; they are candidates to add later, each kept to one effect.

### Packs

| Pack | Effect | Aimed by | Fired by |
| --- | --- | --- | --- |
| Harpoon | Tethers an enemy for 4 s so the pilot can drag them | Gunner | Gunner |
| Kraken bait | Lure on an enemy draws the kraken to them | Gunner | Gunner |
| Scatter shot | Turret fires a 3-shot spread for 6 s | Gunner | Gunner |
| Ram bow | Armoured bow for 8 s; collisions deal damage | Pilot | Pilot |
| Oil slick | Dropped behind the stern; ships slide; a shot ignites it | Pilot | Pilot |
| Smoke screen | Dropped behind the stern; blocks vision and shots | Pilot | Pilot |
| Full sails | Boost costs no energy for 6 s | — | Pilot |
| Anchor | One instant stop or hairpin turn | — | Pilot |
| Mirror hull | Reflects the next torpedo toward its sender | — | Gunner |
| Spyglass | Reveals the minimap and ships in fog or smoke for 8 s | — | Gunner |

### Obstacles

| Obstacle | Type | Effect |
| --- | --- | --- |
| Sandbar | Static | Ship runs aground, stuck for 1.5 s |
| Kelp bed | Static | Slows the ship; hides it from the minimap |
| Sea stacks | Static | Small rocks that give cover in open water |
| Lighthouse | Static | Rotating beam reveals ships it passes over |
| Coastal fort | Static | Neutral cannon fires at the nearest ship |
| Repair dock | Static | Slow healing while the ship is exposed |
| Currents | Static | One-way lanes: faster with, slower against |
| Tide | Dynamic | Low tide exposes extra reefs and sandbars |
| Tidal wave | Dynamic | Signalled sweep that pushes every ship in its path |
| Waterspout | Dynamic | Flings a ship it touches to a nearby random spot |
| Lightning strike | Dynamic | Target circle appears, then lightning hits it |
| Surfacing whale | Dynamic | Blocks a lane for 5 s |
| Drifting iceberg | Dynamic | A slow-moving island |

- **Avoid** decoy ships and NPC ghost ships: they would be confused with player ghosts.
- **Limit slowing effects** (reef, kelp, sandbar, currents) to two per map so play doesn't feel sluggish.

## On hold and open questions

- **On hold:** a flagship win condition for Fleet Battle (protect a stronger ship; the fleet loses if it sinks).
- **On hold:** the toy-boats-in-a-bathtub look as a second, host-selectable setting. It would be purely cosmetic but doubles the art work.

* [ ] Review the lobby screen mock-ups
* [ ] Review the phone controller mock-ups
* [ ] How the art will be produced
* [ ] Exact pack spawn rate, hazard timings and energy costs (to tune in playtesting)
