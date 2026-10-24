# Stage 0 playtest

The question: **is two people sharing one ship fun?** Play 5 rounds (5 Sink Count matches of 4 minutes) with 4 people, two crews of pilot + gunner, and write down what you see. Afterwards, compare your notes with the match log summaries.

## Before the players arrive

1. **Start the game on the laptop.** Use a normal terminal window, not the Claude prompt's `!` (sudo needs to ask for your password):

   ```
   cd ~/Documents/Projects/sink-or-sail
   sudo docker compose up --build -d
   ```

   This builds the current code and starts the server in the background. It keeps running (and restarts with the laptop) until `sudo docker compose down`.

2. **Find the laptop's address** on the Wi-Fi:

   ```
   hostname -I
   ```

   Use the first address (e.g. `192.168.1.11`). It changes if you switch Wi-Fi networks.

3. **Check it from a phone** on the same Wi-Fi: open `http://<address>:2567`. You should see the Sink or Sail join screen. In a match, the top bar should have a **Pause** button. If it doesn't, the old version is still running: repeat step 1 and check the build output for errors.

4. **Time zone:** log file names use `TZ` in `compose.yaml` (now `Asia/Kolkata`). Change it if the laptop is in another time zone.

## Running a round

1. The **host** (whoever presses Create room) reads out the 4-letter room code.
2. Everyone else opens `http://<address>:2567`, types their name and the code, and taps **Join**.
3. Everyone taps a seat: Crew 1 or 2, Pilot or Gunner. The host's name has a ★.
4. Phones: turn sideways. Android goes fullscreen on the first tap; iPhone shows "Rotate your phone" in portrait.
5. The host taps **Start match**: 3-2-1-Go, then 4 minutes.
6. Afterwards everyone sees the scoreboard; tap **Back to room**. The host starts the next round.

During a round: anyone seated can **Pause**; only the host can **Resume** (3-2-1 again) or **Exit** (ends the round with the current score).

Controls:

| | Phone (sideways) | Laptop |
|---|---|---|
| Pilot | Left thumb: stick to steer. Right thumb: **Boost** | WASD to steer, Space to boost |
| Gunner | Left thumb: stick to aim. Right thumb: **Fire** or **Shield** (one at a time) | Mouse to aim, hold left-click to fire, hold right-click to shield |

Boost and shield share one energy bar per ship.

## Notes sheet (one per round)

Write these down during or right after each round. Short answers are fine.

| Round | Crew 1 (pilot / gunner) | Crew 2 (pilot / gunner) | Score | Did crews talk to each other? | Did anyone laugh? | Did they ask for another round? | Anything else (confusing, annoying, broken) |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |

## After the playtest

Each round wrote one file in `logs/`, named by date, time and room code. Summarise them all at once:

```
npm run summary -- logs/*.jsonl
```

Per crew it shows sinkings, shots, hits, shots blocked by a shield, accuracy, energy spent on boost vs shield, time with an empty bar, and average survival time. Put these next to your notes: for example, did the crew that talked most also share energy better (less empty-bar time)?

## If something goes wrong

- **A phone can't load the page:** check it's on the same Wi-Fi, check the address (`hostname -I`), and try with Cloudflare WARP turned off on the laptop.
- **A phone dropped or the page reloaded:** reopen the page; it rejoins the same seat within 60 seconds.
- **After a rebuild:** pages left open reload themselves when they next join or reconnect, and rejoin their seat. If a phone still acts strangely (e.g. no Pause button), reload its page by hand.
- **Something looks old or broken after a code change:** rebuild (step 1) and check the build output.
- **Server output:** `sudo docker compose logs --tail 100` (normal terminal).
