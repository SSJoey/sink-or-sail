import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { formatSummary, parseLog, summarise } from "./summary.ts";

/**
 * A hand-made 30-second match. Worked out by hand:
 * Ship 0 (Ann & Bob): 3 shots, 1 hit (20 dmg), 1 blocked by ship 1's shield → accuracy 1/3.
 *   Bar empty 4 s → 6 s (2 s). Sunk at 20 s by ship 1, back at 23 s: lives 20 s and 7 s → average 13.5 s.
 * Ship 1 (Cat & —): 1 shot, no hits. Bar empty from 25 s to the end (5 s). Never sunk: one 30 s life.
 * Score 0–1, ship 1 wins.
 */
const SAMPLE = [
  { t: 0, type: "matchStart", room: "KWPZ", crews: [{ ship: 0, pilot: "Ann", gunner: "Bob" }, { ship: 1, pilot: "Cat", gunner: null }], tuning: {} },
  { t: 0, type: "position", ship: 0, x: 150, y: 450, heading: 0, health: 100, energy: 100, sunk: false, boostEnergy: 0, shieldEnergy: 0 },
  { t: 1000, type: "shotFired", ship: 0, player: "Bob", role: "gunner" },
  { t: 1500, type: "hit", ship: 0, player: "Bob", role: "gunner", target: 1, damage: 20 },
  { t: 2000, type: "shotFired", ship: 0, player: "Bob", role: "gunner" },
  { t: 2500, type: "shotBlocked", ship: 1, player: null, role: "gunner", attacker: 0 },
  { t: 3000, type: "shotFired", ship: 1, player: null, role: "gunner" },
  { t: 3000, type: "shotFired", ship: 0, player: "Bob", role: "gunner" },
  { t: 4000, type: "energyEmpty", ship: 0, crew: { pilot: "Ann", gunner: "Bob" } },
  { t: 6000, type: "energyRestored", ship: 0, crew: { pilot: "Ann", gunner: "Bob" } },
  { t: 20000, type: "sunk", ship: 0, crew: { pilot: "Ann", gunner: "Bob" }, by: 1 },
  { t: 23000, type: "respawn", ship: 0, crew: { pilot: "Ann", gunner: "Bob" }, x: 200, y: 180 },
  { t: 25000, type: "energyEmpty", ship: 1, crew: { pilot: "Cat", gunner: null } },
  { t: 30000, type: "matchEnd", winner: 1, endedEarly: false, scores: [
    { ship: 0, sinkings: 0, boostEnergy: 50.5, shieldEnergy: 0 },
    { ship: 1, sinkings: 1, boostEnergy: 0, shieldEnergy: 30 },
  ] },
];
const sampleText = SAMPLE.map((l) => JSON.stringify(l)).join("\n") + "\n";

describe("summarise", () => {
  const summary = summarise(parseLog(sampleText));

  it("reads the match: room, length, winner", () => {
    expect(summary).toMatchObject({ room: "KWPZ", durationSeconds: 30, winner: 1, endedEarly: false, complete: true });
  });

  it("gives the exact per-crew numbers", () => {
    expect(summary.crews).toEqual([
      { ship: 0, pilot: "Ann", gunner: "Bob", sinkings: 0, shots: 3, hits: 1, blocked: 1, accuracy: 1 / 3, boostEnergy: 50.5, shieldEnergy: 0, emptySeconds: 2, averageSurvivalSeconds: 13.5, lives: 2 },
      { ship: 1, pilot: "Cat", gunner: null, sinkings: 1, shots: 1, hits: 0, blocked: 0, accuracy: 0, boostEnergy: 0, shieldEnergy: 30, emptySeconds: 5, averageSurvivalSeconds: 30, lives: 1 },
    ]);
  });

  it("treats a respawn as the end of an empty bar (ships come back full)", () => {
    const lines = parseLog(sampleText).filter((l) => l.type !== "energyRestored");
    // Empty from 4 s until the respawn at 23 s.
    expect(summarise(lines).crews[0]!.emptySeconds).toBe(19);
  });

  it("copes with a log cut short (no matchEnd): counts from events, ends at the last line", () => {
    const cut = parseLog(sampleText).filter((l) => l.type !== "matchEnd");
    const s = summarise(cut);
    expect(s.complete).toBe(false);
    expect(s.durationSeconds).toBe(25);
    expect(s.crews[1]!.sinkings).toBe(1);
    expect(s.crews[0]!.boostEnergy).toBe(0); // last position line
    expect(s.winner).toBeNull();
  });

  it("shows no accuracy for a crew that never fired", () => {
    const quiet = parseLog(sampleText).filter((l) => !(l.type === "shotFired" && l.ship === 1));
    expect(summarise(quiet).crews[1]!.accuracy).toBeNull();
  });

  it("skips blank or broken lines", () => {
    expect(parseLog('{"t":0,"type":"a"}\n\nnot json\n{"t":1,"type":"b"}\n')).toHaveLength(2);
  });
});

describe("formatSummary", () => {
  it("never shows :60 for the match length (179.5 s is 3:00)", () => {
    const lines = parseLog(sampleText).map((l) => (l.type === "matchEnd" ? { ...l, t: 179_500 } : l));
    const text = formatSummary(summarise(lines));
    expect(text).toContain("· 3:00 ·");
    expect(text).not.toContain(":60");
  });

  it("prints a readable per-crew table", () => {
    const text = formatSummary(summarise(parseLog(sampleText)));
    expect(text).toContain("Room KWPZ");
    expect(text).toContain("0:30");
    expect(text).toContain("Crew 2 wins");
    expect(text).toMatch(/Crew 1\s+Ann & Bob/);
    expect(text).toMatch(/Ann & Bob/);
    expect(text).toMatch(/33%/);
    expect(text).toMatch(/13\.5 s/);
  });
});

describe("summary command", () => {
  it("prints the summary of a log file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sos-summary-"));
    try {
      const file = join(dir, "match.jsonl");
      await writeFile(file, sampleText);
      const script = fileURLToPath(new URL("./summarise.ts", import.meta.url));
      const { stdout } = await promisify(execFile)(process.execPath, [script, file]);
      expect(stdout).toContain("Room KWPZ");
      expect(stdout).toMatch(/Ann & Bob/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/**
 * A hand-made 60-second match with packs on. Worked out by hand:
 * Ship 0 (Ann & Bob): picks up a torpedo (5 s, used 7 s), a torpedo (20 s, used 22 s), health (42 s, +40)
 *   and a mine (44 s, lost on sinking at 50 s). Torpedoes: 2 fired, 1 hit (50%). Held 2 s + 2 s → average 2 s.
 *   Its shot sets off ship 1's second mine (36 s), which hits ship 1: 1 mine hit for ship 0, no own hits.
 * Ship 1 (Cat & Dan): picks up a mine (10 s, used 14 s), health (11 s, +25), an EMP (26 s, used 30 s, catches ship 0),
 *   a mine (32 s, used 34 s) and an EMP (38 s, used 40 s, catches nobody). Held 4, 4, 2, 2 s → average 3 s.
 *   Its first mine is touched at 25 s and hits ship 0 and ship 1: 1 mine hit, 1 own hit. 2 EMPs, 1 ship caught → 0.5 per EMP.
 */
const crew0 = { pilot: "Ann", gunner: "Bob" };
const crew1 = { pilot: "Cat", gunner: "Dan" };
const PACK_SAMPLE = [
  { t: 0, type: "matchStart", room: "PACK", crews: [{ ship: 0, ...crew0 }, { ship: 1, ...crew1 }], packsOn: true, seed: 1, tuning: {} },
  { t: 2000, type: "packSignalled", pack: 1, spot: 0, packType: "torpedo" },
  { t: 5000, type: "packPickedUp", ship: 0, crew: crew0, pack: 1, packType: "torpedo" },
  { t: 7000, type: "packUsed", ship: 0, player: "Bob", role: "gunner", packType: "torpedo" },
  { t: 7000, type: "torpedoFired", torpedo: 1, ship: 0, x: 100, y: 100, heading: 0 },
  { t: 8000, type: "torpedoHit", torpedo: 1, ship: 0, player: "Bob", role: "gunner", target: 1, damage: 25, shieldHalved: true },
  { t: 10000, type: "packPickedUp", ship: 1, crew: crew1, pack: 2, packType: "mine" },
  { t: 11000, type: "packPickedUp", ship: 1, crew: crew1, pack: 3, packType: "health" },
  { t: 11000, type: "healthRestored", ship: 1, crew: crew1, amount: 25 },
  { t: 14000, type: "packUsed", ship: 1, player: "Cat", role: "pilot", packType: "mine" },
  { t: 14000, type: "mineDropped", mine: 1, ship: 1, x: 300, y: 300 },
  { t: 15000, type: "mineArmed", mine: 1, owner: 1 },
  { t: 20000, type: "packPickedUp", ship: 0, crew: crew0, pack: 4, packType: "torpedo" },
  { t: 22000, type: "packUsed", ship: 0, player: "Bob", role: "gunner", packType: "torpedo" },
  { t: 22000, type: "torpedoFired", torpedo: 2, ship: 0, x: 100, y: 100, heading: 0 },
  { t: 24000, type: "torpedoEnded", torpedo: 2, ship: 0, reason: "island" },
  { t: 25000, type: "mineTriggered", mine: 1, owner: 1, setOffBy: "ship", shooter: null, hits: [
    { ship: 0, damage: 40, ownMine: false },
    { ship: 1, damage: 40, ownMine: true },
  ] },
  { t: 26000, type: "packPickedUp", ship: 1, crew: crew1, pack: 5, packType: "emp" },
  { t: 30000, type: "packUsed", ship: 1, player: "Dan", role: "gunner", packType: "emp" },
  { t: 30000, type: "empFired", ship: 1, player: "Dan", role: "gunner", caught: [0] },
  { t: 32000, type: "packPickedUp", ship: 1, crew: crew1, pack: 6, packType: "mine" },
  { t: 34000, type: "packUsed", ship: 1, player: "Cat", role: "pilot", packType: "mine" },
  { t: 34000, type: "mineDropped", mine: 2, ship: 1, x: 500, y: 500 },
  { t: 35000, type: "mineArmed", mine: 2, owner: 1 },
  { t: 36000, type: "mineTriggered", mine: 2, owner: 1, setOffBy: "shot", shooter: 0, hits: [{ ship: 1, damage: 40, ownMine: true }] },
  { t: 38000, type: "packPickedUp", ship: 1, crew: crew1, pack: 7, packType: "emp" },
  { t: 40000, type: "packUsed", ship: 1, player: "Dan", role: "gunner", packType: "emp" },
  { t: 40000, type: "empFired", ship: 1, player: "Dan", role: "gunner", caught: [] },
  { t: 42000, type: "packPickedUp", ship: 0, crew: crew0, pack: 8, packType: "health" },
  { t: 42000, type: "healthRestored", ship: 0, crew: crew0, amount: 40 },
  { t: 44000, type: "packPickedUp", ship: 0, crew: crew0, pack: 9, packType: "mine" },
  { t: 50000, type: "sunk", ship: 0, crew: crew0, by: 1 },
  { t: 50000, type: "packLost", ship: 0, crew: crew0, packType: "mine" },
  { t: 53000, type: "respawn", ship: 0, crew: crew0, x: 200, y: 180 },
  { t: 60000, type: "matchEnd", winner: 1, endedEarly: false, scores: [
    { ship: 0, sinkings: 0, boostEnergy: 0, shieldEnergy: 0 },
    { ship: 1, sinkings: 1, boostEnergy: 0, shieldEnergy: 0 },
  ] },
];
const packText = PACK_SAMPLE.map((l) => JSON.stringify(l)).join("\n") + "\n";

describe("summarise with packs", () => {
  const summary = summarise(parseLog(packText));

  it("says packs were on", () => {
    expect(summary.packsOn).toBe(true);
  });

  it("gives the exact per-crew pack figures", () => {
    expect(summary.packs).toEqual([
      {
        ship: 0,
        pickedUp: { mine: 1, torpedo: 2, emp: 0, health: 1 },
        used: { mine: 0, torpedo: 2, emp: 0 },
        lost: { mine: 1, torpedo: 0, emp: 0 },
        averageHeldSeconds: 2,
        torpedoesFired: 2,
        torpedoHits: 1,
        torpedoAccuracy: 0.5,
        mineHits: 1,
        ownMineHits: 0,
        empsFired: 0,
        shipsCaught: 0,
        caughtPerEmp: null,
        healthRestored: 40,
      },
      {
        ship: 1,
        pickedUp: { mine: 2, torpedo: 0, emp: 2, health: 1 },
        used: { mine: 2, torpedo: 0, emp: 2 },
        lost: { mine: 0, torpedo: 0, emp: 0 },
        averageHeldSeconds: 3,
        torpedoesFired: 0,
        torpedoHits: 0,
        torpedoAccuracy: null,
        mineHits: 1,
        ownMineHits: 1,
        empsFired: 2,
        shipsCaught: 1,
        caughtPerEmp: 0.5,
        healthRestored: 25,
      },
    ]);
  });

  it("credits a mine set off by a shot to the shooter, counting a blast on the shooter's own ship as an own hit", () => {
    const lines = parseLog(packText).map((l) =>
      l.type === "mineTriggered" && l.mine === 2 ? { ...l, hits: [{ ship: 0, damage: 40, ownMine: false }, { ship: 1, damage: 40, ownMine: true }] } : l,
    );
    expect(summarise(lines).packs![0]).toMatchObject({ mineHits: 1, ownMineHits: 1 });
    expect(summarise(lines).packs![1]).toMatchObject({ mineHits: 1, ownMineHits: 1 });
  });

  it("shows no average held time when no pack was used", () => {
    const lines = parseLog(packText).filter((l) => !(l.type === "packUsed" && l.ship === 0));
    expect(summarise(lines).packs![0]!.averageHeldSeconds).toBeNull();
  });

  it("has no pack figures with packs off", () => {
    const lines = parseLog(packText).map((l) => (l.type === "matchStart" ? { ...l, packsOn: false } : l));
    const s = summarise(lines);
    expect(s.packsOn).toBe(false);
    expect(s.packs).toBeNull();
  });

  it("treats a Stage 0 log (no packs setting) as packs off", () => {
    const s = summarise(parseLog(sampleText));
    expect(s.packsOn).toBe(false);
    expect(s.packs).toBeNull();
  });
});

describe("formatSummary with packs", () => {
  it("states packs on and prints the packs table", () => {
    const text = formatSummary(summarise(parseLog(packText)));
    expect(text).toContain("Room PACK · 1:00 · Crew 2 wins · Packs on");
    expect(text).toContain("Picked up");
    expect(text).toMatch(/Crew 1\s+M1 T2 E0 H1\s+M0 T2 E0\s+M1 T0 E0\s+2 s\s+1\/2 \(50%\)\s+1 \(own 0\)\s+0\s+40/);
    expect(text).toMatch(/Crew 2\s+M2 T0 E2 H1\s+M2 T0 E2\s+M0 T0 E0\s+3 s\s+0\/0\s+1 \(own 1\)\s+2 · 0\.5 per EMP\s+25/);
  });

  it("states packs off and leaves the packs table out", () => {
    const text = formatSummary(summarise(parseLog(sampleText)));
    expect(text).toContain("· Packs off");
    expect(text).not.toContain("Picked up");
  });
});

describe("summary command with packs", () => {
  it("prints the packs table from a log file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sos-summary-"));
    try {
      const file = join(dir, "match.jsonl");
      await writeFile(file, packText);
      const script = fileURLToPath(new URL("./summarise.ts", import.meta.url));
      const { stdout } = await promisify(execFile)(process.execPath, [script, file]);
      expect(stdout).toContain("Packs on");
      expect(stdout).toContain("Picked up");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
