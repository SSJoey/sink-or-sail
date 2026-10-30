import { describe, expect, it } from "vitest";
import type { SimEvent } from "@sink-or-sail/shared";
import { soundCues } from "./cues.ts";

const one = (e: SimEvent) => soundCues([e]);

describe("soundCues (Stage 4 slice 2)", () => {
  it("names the ship each sound belongs to", () => {
    expect(one({ type: "shotFired", ship: 1, shot: 4 })).toEqual([{ k: "shot", s: [1] }]);
    expect(one({ type: "hit", attacker: 0, target: 2, damage: 20, distance: 300 })).toEqual([{ k: "hit", s: [2] }]);
    expect(one({ type: "shotBlocked", attacker: 0, target: 1 })).toEqual([{ k: "blocked", s: [1] }]);
    expect(one({ type: "boostStarted", ship: 0 })).toEqual([{ k: "boost", s: [0] }]);
    expect(one({ type: "energyEmpty", ship: 1 })).toEqual([{ k: "empty", s: [1] }]);
    expect(one({ type: "sunk", ship: 1, by: 0, cause: "shot" })).toEqual([{ k: "sunk", s: [1] }]);
    expect(one({ type: "respawned", ship: 1, pos: { x: 0, y: 0 } })).toEqual([{ k: "respawn", s: [1] }]);
    expect(one({ type: "healthRestored", ship: 0, amount: 40 })).toEqual([{ k: "health", s: [0] }]);
    expect(one({ type: "mineDropped", mine: 1, owner: 2, pos: { x: 0, y: 0 } })).toEqual([{ k: "mine", s: [2] }]);
    expect(one({ type: "torpedoFired", torpedo: 1, owner: 0, pos: { x: 0, y: 0 }, heading: 0 })).toEqual([{ k: "torpedo", s: [0] }]);
    expect(one({ type: "torpedoHit", torpedo: 1, attacker: 0, target: 1, damage: 50, shieldHalved: false })).toEqual([{ k: "boom", s: [1] }]);
    expect(one({ type: "empFired", ship: 0, caught: [1] })).toEqual([{ k: "emp", s: [0, 1] }]);
    expect(one({ type: "reefHit", ship: 1, damage: 5 })).toEqual([{ k: "reef", s: [1] }]);
    expect(one({ type: "krakenGrab", ship: 2, hazard: 3 })).toEqual([{ k: "kraken", s: [2] }]);
  });

  it("a mine blast belongs to every ship it hit (or its owner when it hit none)", () => {
    expect(one({ type: "mineTriggered", mine: 1, owner: 0, shooter: null, hits: [{ ship: 1, damage: 40, ownMine: false }, { ship: 0, damage: 40, ownMine: true }] })).toEqual([{ k: "boom", s: [1, 0] }]);
    expect(one({ type: "mineTriggered", mine: 1, owner: 0, shooter: 2, hits: [] })).toEqual([{ k: "boom", s: [0] }]);
  });

  it("a ram belongs to both ships, a wreck to the ship credited, a hazard's signal to nobody", () => {
    expect(one({ type: "bump", ships: [0, 1], damage: [5, 5] })).toEqual([{ k: "bump", s: [0, 1] }]);
    expect(one({ type: "wreckDestroyed", wreck: 2, by: 1 })).toEqual([{ k: "wreck", s: [1] }]);
    expect(one({ type: "wreckDestroyed", wreck: 2, by: null })).toEqual([{ k: "wreck", s: [] }]);
    expect(one({ type: "hazardSignalled", hazard: 1, kind: "kraken", pos: { x: 0, y: 0 }, heading: 0 })).toEqual([{ k: "hazard", s: [] }]);
  });

  it("a slot pack's pickup chimes; a health pack's pickup is the health chord instead", () => {
    expect(one({ type: "packPickedUp", ship: 0, pack: 1, packType: "torpedo" })).toEqual([{ k: "pickup", s: [0] }]);
    expect(soundCues([{ type: "packPickedUp", ship: 0, pack: 1, packType: "health" }, { type: "healthRestored", ship: 0, amount: 40 }])).toEqual([{ k: "health", s: [0] }]);
  });

  it("events with no sound give no cue", () => {
    expect(soundCues([
      { type: "shieldRaised", ship: 0 },
      { type: "energyRestored", ship: 0 },
      { type: "mineArmed", mine: 1, owner: 0 },
      { type: "packSignalled", pack: 1, spot: 0, packType: "mine" },
      { type: "stormDamage", ship: 0, damage: 1 },
    ])).toEqual([]);
  });
});
