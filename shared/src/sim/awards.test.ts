import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { earnedAwards, newTally, pickAwards, updateTally, type AwardTally } from "./awards.ts";
import { createWorld } from "./match.ts";
import type { SimEvent, World } from "./types.ts";

const A = TUNING.awards;

/** A 3-ship world at the end of a match, every ship afloat at full health unless changed. */
function endWorld(setUp: (w: World) => void = () => {}): World {
  const w = createWorld({ ships: 3 });
  setUp(w);
  return w;
}
/** A tally after these events (each in its own step), with optional per-ship extras. */
function tally(events: SimEvent[], extra: Partial<AwardTally> = {}): AwardTally {
  let t = newTally(3);
  const w = endWorld();
  for (const e of events) t = updateTally(t, w, [e], 0);
  return { ...t, ...extra };
}
const awardOf = (earned: ReturnType<typeof earnedAwards>, award: string) => earned.find((a) => a.award === award);

describe("the award tally (Stage 3)", () => {
  it("counts hits landed and taken, shots, reef hits, bumps, grabs, packs and haunted hazards", () => {
    const t = tally([
      { type: "shotFired", ship: 0, shot: 1 }, { type: "shotFired", ship: 0, shot: 2 },
      { type: "hit", attacker: 0, target: 1, damage: 20 },
      { type: "torpedoHit", torpedo: 1, attacker: 2, target: 1, damage: 50, shieldHalved: false },
      { type: "mineTriggered", mine: 1, owner: 0, shooter: null, hits: [{ ship: 2, damage: 40, ownMine: false }, { ship: 0, damage: 0, ownMine: true }] },
      { type: "bump", ships: [0, 1], damage: [5, 0] },
      { type: "reefHit", ship: 2, damage: 5 },
      { type: "krakenGrab", ship: 1, hazard: 0 },
      { type: "packPickedUp", ship: 2, pack: 1, packType: "mine" },
      { type: "hauntingTriggered", zone: 3, hazard: 1, ghosts: [2] },
    ]);
    expect(t.hitsLanded).toEqual([1, 0, 1]);
    expect(t.shotHits).toEqual([1, 0, 0]);
    expect(t.hitsTaken).toEqual([1, 2, 1]);
    expect(t.shots).toEqual([2, 0, 0]);
    expect(t.bumps).toEqual([1, 1, 0]);
    expect(t.reefHits).toEqual([0, 0, 1]);
    expect(t.krakenGrabs).toEqual([0, 1, 0]);
    expect(t.packs).toEqual([0, 0, 1]);
    expect(t.haunted).toEqual([0, 0, 1]);
  });

  it("records the first ship sunk, own-mine sinkings, and sinkings by the closing storm", () => {
    const t = tally([
      { type: "sunk", ship: 2, by: null, cause: "ownMine" },
      { type: "sunk", ship: 1, by: null, cause: "storm", livesLeft: 0 },
    ]);
    expect([t.firstSunk, t.ownMine, t.sunkByStorm]).toEqual([2, [0, 0, 1], [false, true, false]]);
  });

  it(`times each ship held still (below ${A.stationarySpeed}), in storms and whirlpools, and the longest pack hold`, () => {
    const w = createWorld({ ships: 2, hazards: true, mode: "lastAfloat" });
    w.time = 200; // the closing storm is closing: ship 0 at its start is outside the circle
    w.ships[0] = { ...w.ships[0]!, vel: { x: 5, y: 0 } };
    w.ships[1] = { ...w.ships[1]!, vel: { x: 100, y: 0 }, pos: { x: 800, y: 150 } };
    w.hazards = [{ id: 0, kind: "whirlpool", pos: { x: 800, y: 150 }, heading: 0, phase: "active", timeLeft: 9, spin: 1 }];
    let t = newTally(2);
    t = updateTally(t, w, [{ type: "packPickedUp", ship: 1, pack: 0, packType: "torpedo" }], 0.5);
    for (let i = 0; i < 9; i++) t = updateTally(t, { ...w, time: w.time + 0.5 * (i + 1) }, [], 0.5);
    expect(t.stationary).toEqual([5, 0]);
    expect(t.storm[0]).toBeCloseTo(5);
    expect(t.whirlpool).toEqual([0, 5]);
    t = updateTally(t, { ...w, time: 236 }, [{ type: "packUsed", ship: 1, packType: "torpedo", role: "gunner" }], 0);
    expect(t.longestHold).toEqual([0, 36]);
  });
});

describe("earning awards", () => {
  it("gives each award to the one crew that leads, at or above its minimum", () => {
    const earned = earnedAwards(tally([], {
      hitsLanded: [7, 2, 0], hitsTaken: [3, 0, 5], krakenGrabs: [0, 2, 1], haunted: [0, 0, 1], ownMine: [1, 0, 0],
      reefHits: [0, 0, 4], bumps: [3, 1, 0], stationary: [0, 25, 3], shots: [12, 30, 5], shotHits: [6, 2, 1],
      packs: [3, 1, 0], longestHold: [0, 0, 45], storm: [12, 0, 0], whirlpool: [0, 6, 0], firstSunk: 2,
    }), endWorld((w) => {
      w.ships[0] = { ...w.ships[0]!, shieldEnergy: 80, boostEnergy: 10 };
      w.ships[1] = { ...w.ships[1]!, boostEnergy: 90, health: 20 };
    }));
    expect(earned.map((a) => `${a.award}:${a.ship}`).sort()).toEqual([
      "bumperBoats:0", "closeShave:1", "davyJones:2", "ghost:2", "hoarder:2", "krakensFavourite:1", "mineAllMine:0", "packRat:0",
      "rockCollector:2", "sharpshooter:0", "shieldHog:0", "sittingDuck:1", "speedDemon:1", "stormChaser:0", "triggerHappy:1", "untouchable:1", "whirlpoolTourist:1",
    ].sort());
    expect(awardOf(earned, "sharpshooter")!.detail).toBe("most hits (7)");
  });

  it("gives a tied award to nobody", () => {
    const earned = earnedAwards(tally([], { hitsLanded: [5, 5, 1] }), endWorld());
    expect(awardOf(earned, "sharpshooter")).toBeUndefined();
  });

  it("needs each minimum", () => {
    const earned = earnedAwards(tally([], { hitsLanded: [A.sharpshooterHits - 1, 0, 0], stationary: [A.sittingDuckSeconds - 1, 0, 0] }), endWorld());
    expect(awardOf(earned, "sharpshooter")).toBeUndefined();
    expect(awardOf(earned, "sittingDuck")).toBeUndefined();
  });

  it("Untouchable and Close Shave only for crews afloat at the end; Storm Chaser not for a crew the closing storm sank", () => {
    const earned = earnedAwards(tally([], { hitsTaken: [0, 3, 3], storm: [20, 0, 0], sunkByStorm: [true, false, false] }), endWorld((w) => {
      w.ships[0] = { ...w.ships[0]!, sunk: true, health: 10 };
      w.ships[2] = { ...w.ships[2]!, health: 15 };
    }));
    expect(awardOf(earned, "untouchable")).toBeUndefined(); // ship 0 is sunk; 1 and 2 tie
    expect(awardOf(earned, "closeShave")!.ship).toBe(2);
    expect(awardOf(earned, "stormChaser")).toBeUndefined();
  });

  it("Trigger Happy only when the crew that fired most also has the worst accuracy", () => {
    const worst = earnedAwards(tally([], { shots: [20, 12, 0], shotHits: [2, 6, 0] }), endWorld());
    expect(awardOf(worst, "triggerHappy")!.ship).toBe(0);
    const accurate = earnedAwards(tally([], { shots: [20, 12, 0], shotHits: [10, 2, 0] }), endWorld());
    expect(awardOf(accurate, "triggerHappy")).toBeUndefined();
  });
});

describe("picking the awards shown", () => {
  const earned = [
    { award: "sharpshooter", ship: 0, detail: "" }, { award: "packRat", ship: 0, detail: "" }, { award: "shieldHog", ship: 0, detail: "" },
    { award: "speedDemon", ship: 1, detail: "" }, { award: "hoarder", ship: 1, detail: "" }, { award: "davyJones", ship: 2, detail: "" },
  ];

  it(`shows at most one per crew and at most ${A.maxPerMatch}, picked with the match's seed`, () => {
    for (let seed = 0; seed < 30; seed++) {
      const picked = pickAwards(earned, seed);
      expect(picked).toHaveLength(3);
      expect(new Set(picked.map((a) => a.ship)).size).toBe(3);
      expect(pickAwards(earned, seed)).toEqual(picked);
    }
    expect(new Set(Array.from({ length: 30 }, (_, seed) => pickAwards(earned, seed)[0]!.award)).size).toBeGreaterThan(1);
  });

  it("a crew whose award was tied away still gets its next award (only awards actually earned count)", () => {
    expect(pickAwards([{ award: "packRat", ship: 1, detail: "" }], 3)).toEqual([{ award: "packRat", ship: 1, detail: "" }]);
    expect(pickAwards([], 3)).toEqual([]);
  });
});
