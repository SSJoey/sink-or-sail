# Combined playtest (Stage 0 + Stage 1)

Two questions:

1. **Packs off (Stage 0):** is two people sharing one ship fun?
2. **Packs on (Stage 1):** do packs create "line it up… now!" moments for the crew?

Play **at least 3 rounds with packs off, then at least 3 rounds with packs on**, with the same 4 people: two crews of pilot + gunner. Each round is a 4-minute Sink Count match. Write down what you see, then compare your notes with the match log summaries.

## Before the players arrive

1. **Start the game on the laptop.** Use a normal terminal window, not the Claude prompt's `!` (sudo needs to ask for your password):

   ```
   cd ~/Documents/Projects/sink-or-sail
   sudo docker compose up --build -d
   ```

   This builds the current code and starts the server in the background. It keeps running (and restarts with the laptop) until `sudo docker compose down`.

   **For the room screen's QR code** (Stage 3), start it with the laptop's Wi-Fi address instead, so a laptop page opened as `localhost` can still show phones a QR code:

   ```
   sudo HOST_IP=$(hostname -I | cut -d' ' -f1) docker compose up --build -d
   ```

   Pages opened at the Wi-Fi address (as phones do) show the QR code either way.

2. **Find the laptop's address** on the Wi-Fi:

   ```
   hostname -I
   ```

   Use the first address (e.g. `192.168.1.11`). It changes if you switch Wi-Fi networks.

3. **Check it from a phone** on the same Wi-Fi: open `http://<address>:2567`. You should see the Sink or Sail join screen. In a match, the top bar should show **Packs: — · —** and a **Pause** button. If not, the old version is still running: repeat step 1 and check the build output for errors.

4. **Time zone:** log file names use `TZ` in `compose.yaml` (now `Asia/Kolkata`). Change it if the laptop is in another time zone.

## Running a round

1. The **host** (whoever presses Create room) reads out the 4-letter room code.
2. Everyone else opens `http://<address>:2567`, types their name and the code, and taps **Join**.
3. Everyone taps a seat: Crew 1 or 2, Pilot or Gunner (Crew 3 is only for the extra 3-ship rounds). The host's name has a ★. To switch, tap your own seat again (or **Leave seat**) to free it, then tap another; this works between matches, not during one.
4. **Packs:** the host ticks or unticks **Packs on** in the room screen. Everyone else sees "Packs: on" or "Packs: off". A change applies from the next match. Rounds 1–3: off. Rounds 4–6: on.
5. Phones: turn sideways. Android goes fullscreen on the first tap; iPhone shows "Rotate your phone" in portrait.
6. The host taps **Start match**: 3-2-1-Go, then 4 minutes.
7. Afterwards everyone sees the scoreboard; tap **Back to room**. The host starts the next round.

During a round: anyone seated can **Pause**; only the host can **Resume** (3-2-1 again) or **Exit** (ends the round with the current score).

## Controls

| | Phone (sideways) | Laptop |
|---|---|---|
| Pilot | Left thumb: stick to steer. Right thumb: **Boost**; small **Pack** button above it | WASD to steer, Space to boost, **E** to drop a mine |
| Gunner | Left thumb: stick to aim. Right thumb: **Fire** or **Shield** (one at a time); small **Pack** button above | Mouse to aim, hold left-click to fire, hold right-click to shield, **E** to fire a torpedo or EMP |

Boost and shield share one energy bar per ship.

## Packs (rounds with packs on)

Up to 2 packs float on the sea at once. A spot glows (a pulsing ring) for 3 s before its pack appears. Sail over a pack to pick it up. A pack nobody picks up disappears after 45 s; it blinks for its last 5 s.

Each ship has **two pack slots**: one for the pilot's pack (mine) and one for the gunner's (torpedo or EMP). So a ship can carry a mine and a torpedo at once, but not two mines, or a torpedo and an EMP. Both crewmates' top bars show both slots by letter, pilot's first: `Packs: M · T`, with `—` for an empty slot. Held packs are lost if the ship sinks.

Each crewmate's **Pack** button shows and uses only their own slot, and lights up when it holds a pack. On a laptop, that crewmate presses E.

| Pack | Looks like | Who uses it | What it does |
|---|---|---|---|
| **Mine** | circle, **M** | Pilot | Dropped behind the stern. Arms after 1 s (looks different once armed), then blows up on **any** ship that touches it, the dropper's included. Shots set off armed mines too. Lasts 30 s. |
| **Torpedo** | capsule, **T** | Gunner | Goes straight out from the bow, slower than a shot. No aiming line: the pilot lines up the ship. Big hit; a raised shield halves it. The island and the sea edge stop it. |
| **EMP** | diamond, **E** | Gunner | A ring around the firing ship. Enemy ships in range turn grey for 3 s: no fire, boost, shield or packs, but they can still steer. |
| **Health** | square, **H** | Nobody | Heals on pickup and doesn't take a slot. A ship at full health sails over it. |

Android phones buzz briefly when a torpedo or EMP is loaded, so the gunner knows. iPhones don't buzz.

## Notes sheet (one row per round)

Write these down during or right after each round. Short answers are fine.

### Packs off

| Round | Crew 1 (pilot / gunner) | Crew 2 (pilot / gunner) | Score | Did crews talk to each other? | Did anyone laugh? | Did they ask for another round? | Kept checking the clock? | Anything else (confusing, annoying, broken) |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |

### Packs on

| Round | Crew 1 (pilot / gunner) | Crew 2 (pilot / gunner) | Score | Did crews talk to each other? | Did anyone laugh? | Did they ask for another round? | "Line it up… now!" moments? | Packs chased / ignored | Kept checking the clock? | Anything else (confusing, annoying, broken) |
|---|---|---|---|---|---|---|---|---|---|---|
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |
| 6 | | | | | | | | | | |

### Extra: 3-ship rounds (when 6 people are around)

Not part of the 6 rounds above. With 6 people, play a few extra rounds with three crews: seat someone in **Crew 3** (teal ▲) before the host starts, and the match has 3 ships, starting on a triangle around the island. Up to 2 packs are on the sea at once, as with 2 ships. If nobody sits in Crew 3 when the match starts, it stays a 2-ship match; Crew 3 opens again for the next one.

| Round | Crew 1 (pilot / gunner) | Crew 2 (pilot / gunner) | Crew 3 (pilot / gunner) | Packs on/off | Score | Did crews talk to each other? | Did anyone laugh? | Did they ask for another round? | Two crews ganging up on one? | Kept checking the clock? | Anything else (confusing, annoying, broken) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A | | | | | | | | | | | |
| B | | | | | | | | | | | |
| C | | | | | | | | | | | |

## After the playtest

Each round wrote one file in `logs/`, named by date, time and room code. Summarise them all at once:

```
npm run summary -- logs/*.jsonl
```

Each match's header says whether packs were on. Per crew it shows sinkings, shots, hits, shots blocked by a shield, accuracy, energy spent on boost vs shield, time with an empty bar, and average survival time. With packs on, a second table shows per crew: packs picked up, used and lost by type (M T E H), average time a pack was held before use, torpedo hits out of torpedoes fired, mine hits (with hits on their own ship counted apart), EMPs fired and ships caught per EMP, and health restored.

Put these next to your notes and compare the two sets of rounds. For example:
- Did the crew that talked most also share energy better (less empty-bar time)?
- With packs on, were packs used quickly (short average held time) or carried around?
- Which packs were picked up but rarely used?
- Did torpedo accuracy match the "line it up" moments you noted?

Write the comparison below.

## Findings

_(to fill in after the playtest)_

## If something goes wrong

- **A phone can't load the page:** check it's on the same Wi-Fi, check the address (`hostname -I`), and try with Cloudflare WARP turned off on the laptop.
- **A phone dropped or the page reloaded:** reopen the page; it rejoins the same seat within 60 seconds.
- **After a rebuild:** pages left open reload themselves when they next join or reconnect, and rejoin their seat. If a phone still acts strangely (e.g. the top bar still says "Pack:" instead of "Packs:"), reload its page by hand.
- **Something looks old or broken after a code change:** rebuild (step 1) and check the build output.
- **Server output:** `sudo docker compose logs --tail 100` (normal terminal).

---

# Stage 2 playtest

One question: **do hazards and ghosts keep sunk crews involved?**

Play **Last Afloat rounds with hazards on and with hazards off** (at least 2 off, then at least 3 on), with the same people. Ghosts only come with **3 ships** (5–6 players): with 2 ships, the first crew out ends the match. So play 3-ship rounds whenever there are enough people. It can run in the same session as the combined playtest above.

## Setting up a round

Start the game and join as in "Before the players arrive" and "Running a round" above. Then the host sets, in the room screen:

- **Mode:** tap **Last Afloat**; pick **Lives** (1–5; 1 gets crews out, and ghosts in, soonest).
- **Hazards on / off**, and with hazards on the **Reefs** amount (None, Few, All).
- **Layout:** one of the nine, or **Random** (never the same twice in a row).

Every crew with a ship needs at least one player, or Start shows a message.

## What players will see (hazards on)

- **Reefs** (light, dotted shallows): slow you down and hit you once on entering.
- **Shipwrecks** (broken brown hulls): solid until shot, rammed or blasted to pieces; a glint means it holds a pack.
- **Closing storm** (Last Afloat): "Storm in 1:00" at the top, then a dark storm closing in from the edge; outside the circle you lose health every second.
- **Dynamic hazards**, signalled 3 s before they act (the first at 0:30, then 30–50 s after the last one has gone; one at a time, plus one set off by haunting):
  - **Moving storm** (dashed ring and arrow): a dark cloud that drifts, carries ships along and hides what's inside it from everyone else.
  - **Whirlpool** (dashed ring with turning arrows): pulls ships in and swirls them round; only boosting gets you out of the eye; riding the swirl is a slingshot.
  - **Kraken** (ripples and bubbles): swims to the nearest ship, grabs it for 3 s and hurts it; three shots (or a torpedo and a shot) make it let go.
- **Ghosts** (a crew that is out): a dashed outline in the crew's colour; both crewmates steer it (WASD, or the stick on a phone). It can't touch anyone, but where it lingers, fog builds ("Haunting ▮▮▮▯▯" on its crew's top bar) until a hazard comes in that zone.

## Notes sheet (one row per round)

| Round | Layout | Ships · lives | Hazards on/off | Crews (pilot / gunner) | Winner | Sunk crews: stayed involved as ghosts? What did they do? | Hazards noticed / avoided / used | Asked for another round? | Anything else (confusing, annoying, broken) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | off | | | | — | | |
| 2 | | | off | | | | — | | |
| 3 | | | on | | | | | | |
| 4 | | | on | | | | | | |
| 5 | | | on | | | | | | |

## After the playtest

Summarise the logs as above (`npm run summary -- logs/*.jsonl`). For Stage 2 the summary adds:

- **Header:** mode and lives, layout (and whether Random picked it), hazards and reefs.
- **Main table:** "Sunk by" (how each crew was sunk, by cause).
- **Hazards table** (hazards on), per crew: reef hits and damage, damage ramming wrecks, wrecks destroyed (and packs they released), closing-storm damage, time in moving storms and whirlpools, kraken grabs (and their damage), hits on krakens.
- **Hazards this match:** per kind, how many came, how many haunting set off, and how they ended.
- **Last Afloat table:** finishing place, time afloat, lives used, and (with a ghost) time as a ghost and hazards set off by haunting.

Compare them with your notes. For example:
- Did crews with long "time as a ghost" also set off hazards, or just drift?
- Which hazards ended by "time up" with nobody caught (ignored), and which caught or were shot?
- Did rounds with hazards on get more "another round?" than rounds with hazards off?

## Findings

_(to fill in after the playtest)_
