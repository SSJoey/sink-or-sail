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
