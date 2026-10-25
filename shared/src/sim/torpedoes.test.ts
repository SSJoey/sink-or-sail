import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { createWorld } from "./match.ts";
import { step } from "./step.ts";
import type { ShipInput, SimEvent, World } from "./types.ts";

const DT = 0.05;
const T = TUNING.torpedo;
const FULL = TUNING.ship.maxHealth;
const AHEAD = TUNING.ship.radius + 2;

const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const gunnerPack: ShipInput = { ...idle, gunner: { ...idle.gunner, pack: true } };
const pilotPack: ShipInput = { ...idle, pilot: { ...idle.pilot, pack: true } };

/** Packs on, nothing spawning; ship 0 at (300, 200) facing east holding a torpedo; ship 1 far away. */
function world(changes: (w: World) => void = () => {}): World {
  const w = createWorld({ packs: true, seed: 1 });
  w.nextSignalIn = null;
  w.ships[0] = { ...w.ships[0]!, pos: { x: 300, y: 200 }, heading: 0, turret: Math.PI, gunnerPack: "torpedo" };
  w.ships[1] = { ...w.ships[1]!, pos: { x: 1300, y: 750 } };
  changes(w);
  return w;
}

function run(w: World, seconds: number, inputs: (w: World) => (ShipInput | undefined)[] = () => []) {
  const events: SimEvent[] = [];
  let cur = w;
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
    const r = step(cur, inputs(cur), DT);
    cur = r.world;
    events.push(...r.events);
  }
  return { world: cur, events };
}

/** Fires once, then no more input. */
const fireOnce = (input: ShipInput) => (w: World) => (w.time < DT / 2 ? [input] : []);

describe("firing a torpedo", () => {
  it("the gunner fires it from just ahead of the bow, along the heading (not the turret); the slot empties", () => {
    const { world: after, events } = run(world(), DT, fireOnce(gunnerPack));
    expect(after.ships[0]!.gunnerPack).toBeNull();
    expect(events).toContainEqual({ type: "packUsed", ship: 0, packType: "torpedo", role: "gunner" });
    expect(events).toContainEqual({ type: "torpedoFired", torpedo: 0, owner: 0, pos: { x: 300 + AHEAD, y: 200 }, heading: 0 });
    // It has already moved one step east at torpedo speed.
    expect(after.torpedoes).toEqual([{ id: 0, owner: 0, pos: { x: 300 + AHEAD + T.speed * DT, y: 200 }, vel: { x: T.speed, y: 0 } }]);
  });

  it("keeps the direction it was fired in, whatever the ship does afterwards", () => {
    const w = world((w) => { w.ships[0] = { ...w.ships[0]!, heading: Math.PI / 2 }; });
    const turn: ShipInput = { ...idle, pilot: { steer: { x: 1, y: 0 }, boost: false } };
    const { world: after } = run(w, 1, (cur) => [cur.time < DT / 2 ? gunnerPack : turn]);
    const torpedo = after.torpedoes[0]!;
    expect(torpedo.pos.x).toBeCloseTo(300);
    expect(torpedo.vel.x).toBeCloseTo(0);
    expect(torpedo.vel.y).toBeCloseTo(T.speed);
  });

  it(`travels at ${T.speed} per second, slower than a shot`, () => {
    expect(T.speed).toBeLessThan(TUNING.gun.shotSpeed);
    const { world: after } = run(world(), 1, fireOnce(gunnerPack));
    expect(after.torpedoes[0]!.pos.x).toBeCloseTo(300 + AHEAD + T.speed * 1);
  });

  it("only the gunner can fire it: the pilot's Pack button does nothing", () => {
    const { world: after } = run(world(), 0.5, () => [pilotPack]);
    expect(after.torpedoes).toEqual([]);
    expect(after.ships[0]!.gunnerPack).toBe("torpedo");
  });

  it("is used once", () => {
    const { world: after } = run(world(), 0.5, () => [gunnerPack]);
    expect(after.torpedoes).toHaveLength(1);
  });

  it("can be fired while the shield is up", () => {
    const both: ShipInput = { ...idle, gunner: { ...idle.gunner, shield: true, pack: true } };
    expect(run(world(), DT, fireOnce(both)).world.torpedoes).toHaveLength(1);
  });

  it("ends respawn protection, like firing the gun", () => {
    const { world: after, events } = run(world((w) => { w.ships[0] = { ...w.ships[0]!, protection: 1.5 }; }), DT, fireOnce(gunnerPack));
    expect(after.ships[0]!.protection).toBe(0);
    expect(events).toContainEqual({ type: "protectionEnded", ship: 0 });
  });
});

describe("torpedo hits", () => {
  /** Ship 1 sits 300 east of ship 0, in the torpedo's path. */
  const target = (changes: Partial<World["ships"][number]> = {}) =>
    world((w) => { w.ships[1] = { ...w.ships[1]!, pos: { x: 600, y: 200 }, ...changes }; });

  it(`deals ${T.damage * 100}% of full health and is used up`, () => {
    const { world: after, events } = run(target(), 1.5, fireOnce(gunnerPack));
    expect(after.ships[1]!.health).toBeCloseTo(FULL * (1 - T.damage));
    expect(after.torpedoes).toEqual([]);
    expect(events).toContainEqual({ type: "torpedoHit", torpedo: 0, attacker: 0, target: 1, damage: FULL * T.damage, shieldHalved: false });
  });

  it("is halved by a raised shield", () => {
    const shield: ShipInput = { ...idle, gunner: { ...idle.gunner, shield: true } };
    const { world: after, events } = run(target(), 1.5, (w) => [w.time < DT / 2 ? gunnerPack : idle, shield]);
    expect(after.ships[1]!.health).toBeCloseTo(FULL * (1 - T.damage * T.shieldFactor));
    expect(events).toContainEqual(expect.objectContaining({ type: "torpedoHit", shieldHalved: true, damage: FULL * T.damage * T.shieldFactor }));
  });

  it("does nothing to a ship with respawn protection, but is used up", () => {
    const { world: after, events } = run(target({ protection: 1.9 }), 1.5, fireOnce(gunnerPack));
    expect(after.ships[1]!.health).toBe(FULL);
    expect(after.torpedoes).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: "torpedoHit", target: 1, damage: 0 }));
  });

  it("sinks a ship and credits the firing crew", () => {
    const { world: after, events } = run(target({ health: 30 }), 1.5, fireOnce(gunnerPack));
    expect(events).toContainEqual({ type: "sunk", ship: 1, by: 0, cause: "torpedo" });
    expect(after.ships[0]!.sinkings).toBe(1);
  });

  it("never hits its own ship", () => {
    // Fire, then the ship boosts after it: the torpedo is faster, but even overlapping it wouldn't hit.
    const boost: ShipInput = { ...idle, pilot: { steer: { x: 1, y: 0 }, boost: true } };
    const { world: after } = run(world(), 1, (w) => [w.time < DT / 2 ? gunnerPack : boost]);
    expect(after.ships[0]!.health).toBe(FULL);
  });

  it("passes through sunk ships", () => {
    const { world: after } = run(target({ sunk: true, respawnIn: 3 }), 0.8, fireOnce(gunnerPack));
    expect(after.torpedoes).toHaveLength(1);
  });
});

describe("what stops a torpedo", () => {
  it("is stopped by the island", () => {
    // Facing east at (500, 450): the island's left edge is around x = 660.
    const w = world((w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: 500, y: 450 } }; });
    const { world: after, events } = run(w, 1.5, fireOnce(gunnerPack));
    expect(after.torpedoes).toEqual([]);
    expect(events).toContainEqual({ type: "torpedoEnded", torpedo: 0, owner: 0, reason: "island" });
  });

  it("is stopped by the sea edge", () => {
    const w = world((w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: 1400, y: 150 } }; });
    const { world: after, events } = run(w, 1.5, fireOnce(gunnerPack));
    expect(after.torpedoes).toEqual([]);
    expect(events).toContainEqual({ type: "torpedoEnded", torpedo: 0, owner: 0, reason: "edge" });
  });

  it("has no time limit in open water: it crosses the whole sea", () => {
    const w = world((w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: 60, y: 150 } }; });
    const { world: mid } = run(w, 5, fireOnce(gunnerPack));
    expect(mid.torpedoes).toHaveLength(1);
    expect(mid.torpedoes[0]!.pos.x).toBeGreaterThan(1500);
  });

  it("sets off an armed mine in its path (used up; the firing crew gets the credit)", () => {
    const w = world((w) => {
      w.mines = [{ id: 0, owner: 1, pos: { x: 500, y: 200 }, age: TUNING.mine.armTime }];
      w.ships[1] = { ...w.ships[1]!, pos: { x: 500, y: 270 }, health: 10 };
    });
    const { world: after, events } = run(w, 1.5, fireOnce(gunnerPack));
    expect(after.mines).toEqual([]);
    expect(after.torpedoes).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: "mineTriggered", mine: 0, shooter: 0 }));
    expect(events).toContainEqual({ type: "torpedoEnded", torpedo: 0, owner: 0, reason: "mine" });
    expect(events).toContainEqual({ type: "sunk", ship: 1, by: 0, cause: "torpedo" });
  });
});

describe("packs off", () => {
  it("never has torpedoes", () => {
    const w = createWorld();
    w.ships[0] = { ...w.ships[0]!, gunnerPack: "torpedo" };
    expect(run(w, 0.5, () => [gunnerPack]).world.torpedoes).toEqual([]);
  });
});
