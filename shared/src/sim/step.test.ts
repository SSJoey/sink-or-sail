import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { ISLAND, SPAWN_POINTS } from "./map.ts";
import { createWorld } from "./match.ts";
import { step } from "./step.ts";
import type { ShipInput, SimEvent, World } from "./types.ts";
import { length } from "./vec.ts";

const DT = 0.05;
const { shotDamage } = TUNING.gun;

function input(i: { steer?: { x: number; y: number }; boost?: boolean; aim?: { x: number; y: number }; fire?: boolean; shield?: boolean } = {}): ShipInput {
  return {
    pilot: { steer: i.steer ?? { x: 0, y: 0 }, boost: i.boost ?? false },
    gunner: { aim: i.aim ?? { x: 0, y: 0 }, fire: i.fire ?? false, shield: i.shield ?? false },
  };
}

/** Ship 0 at (400, 200) and ship 1 at (600, 200), stopped, with open water between. */
function duel(): World {
  const world = createWorld();
  world.ships[0] = { ...world.ships[0]!, pos: { x: 400, y: 200 }, heading: 0, turret: 0 };
  world.ships[1] = { ...world.ships[1]!, pos: { x: 600, y: 200 }, heading: Math.PI, turret: Math.PI };
  return world;
}

/** Steps for `seconds` with the given inputs; returns the final world and every event in order. */
function run(world: World, seconds: number, inputs: (ShipInput | undefined)[] | ((w: World) => (ShipInput | undefined)[])) {
  const events: SimEvent[] = [];
  let w = world;
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    const result = step(w, typeof inputs === "function" ? inputs(w) : inputs, DT);
    w = result.world;
    events.push(...result.events);
  }
  return { world: w, events };
}

const ofType = <T extends SimEvent["type"]>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe("step basics", () => {
  it("does not change the world it was given", () => {
    const world = duel();
    const before = JSON.parse(JSON.stringify(world));
    step(world, [input({ steer: { x: 1, y: 0 }, fire: true, boost: true })], DT);
    expect(world).toEqual(before);
  });

  it("advances time", () => {
    expect(step(createWorld(), [], DT).world.time).toBeCloseTo(DT);
  });

  it("treats missing input as no input: ships stay put", () => {
    const world = createWorld();
    const after = run(world, 1, []).world;
    expect(after.ships[0]!.pos).toEqual(world.ships[0]!.pos);
  });

  it("is deterministic: the same inputs give exactly the same match", () => {
    const script = (w: World) => [
      input({ steer: { x: Math.cos(w.time), y: Math.sin(w.time) }, boost: w.time % 3 < 1, aim: { x: 1, y: 0.2 }, fire: true }),
      input({ steer: { x: -1, y: Math.sin(w.time * 2) }, aim: { x: -1, y: 0 }, fire: w.time % 2 < 1, shield: w.time % 2 >= 1 }),
    ];
    const a = run(createWorld(), 20, script);
    const b = run(createWorld(), 20, script);
    expect(a.world).toEqual(b.world);
    expect(a.events).toEqual(b.events);
  });

  it("ignores a zero or invalid time step", () => {
    const world = createWorld();
    expect(step(world, [], 0).world).toBe(world);
    expect(step(world, [], NaN).world).toBe(world);
  });
});

describe("sailing", () => {
  it("moves the pilot's ship and uses the shared bar for boost", () => {
    const { world, events } = run(createWorld(), 1, [input({ steer: { x: 1, y: 0 }, boost: true })]);
    expect(world.ships[0]!.pos.x).toBeGreaterThan(150 + 100);
    expect(world.ships[0]!.energy).toBeCloseTo(TUNING.energy.max - TUNING.boost.energyPerSecond, 0);
    expect(ofType(events, "boostStarted")).toEqual([{ type: "boostStarted", ship: 0 }]);
  });

  it("counts energy spent on boost and on shield for each ship", () => {
    const { world } = run(createWorld(), 1, [input({ boost: true }), input({ shield: true })]);
    expect(world.ships[0]!.boostEnergy).toBeCloseTo(TUNING.boost.energyPerSecond, 0);
    expect(world.ships[0]!.shieldEnergy).toBe(0);
    expect(world.ships[1]!.shieldEnergy).toBeCloseTo(TUNING.shield.energyPerSecond, 0);
  });

  it("stops boosting when the bar runs empty, and slows to normal speed", () => {
    const boostAll = [input({ steer: { x: 0, y: 1 }, boost: true })];
    // A full bar lasts 100 / 30 ≈ 3.3 s; boost comes back at 20 energy, 20 / 7.5 ≈ 2.7 s later.
    const { world, events } = run(createWorld(), 4.6, boostAll);
    expect(ofType(events, "energyEmpty")).toHaveLength(1);
    expect(world.ships[0]!.boosting).toBe(false);
    expect(length(world.ships[0]!.vel)).toBeLessThan(TUNING.ship.maxSpeed + 5);
  });

  it("never lets a ship into the island, even boosting straight at it", () => {
    let world = createWorld();
    for (let i = 0; i < 300; i++) {
      world = step(world, [input({ steer: { x: 1, y: 0 }, boost: i % 100 < 60 })], DT).world;
      expect(circleOverlapsPolygon(world.ships[0]!.pos, TUNING.ship.radius - 0.5, ISLAND)).toBeNull();
    }
  });

  it("keeps ships inside the sea", () => {
    const { world } = run(createWorld(), 5, [input({ steer: { x: -1, y: -1 } })]);
    expect(world.ships[0]!.pos.x).toBeGreaterThanOrEqual(TUNING.ship.radius);
    expect(world.ships[0]!.pos.y).toBeGreaterThanOrEqual(TUNING.ship.radius);
  });
});

describe("shooting", () => {
  it("hits the enemy ship for shot damage", () => {
    const { world, events } = run(duel(), 1, [input({ fire: true })]);
    const hits = ofType(events, "hit");
    expect(hits[0]).toEqual({ type: "hit", attacker: 0, target: 1, damage: shotDamage });
    expect(world.ships[1]!.health).toBe(TUNING.ship.maxHealth - hits.length * shotDamage);
    expect(ofType(events, "shotFired")[0]).toMatchObject({ ship: 0 });
  });

  it("removes a shot once it hits", () => {
    const { world, events } = run(duel(), 0.5, [input({ fire: true })]);
    expect(ofType(events, "hit")).toHaveLength(1);
    const hitShots = world.shots.filter((s) => s.id === 0);
    expect(hitShots).toHaveLength(0);
  });

  it("lets the gunner aim independently of the heading", () => {
    const world = duel();
    world.ships[1] = { ...world.ships[1]!, pos: { x: 400, y: 400 } };
    const { events } = run(world, 1, [input({ steer: { x: 1, y: 0 }, aim: { x: 0, y: 1 }, fire: true })]);
    expect(ofType(events, "hit").length).toBeGreaterThan(0);
  });

  it("is blocked by the island", () => {
    const world = createWorld(); // the ships start either side of the island, level with it
    const { events } = run(world, 3, [input({ fire: true })]);
    expect(ofType(events, "shotFired").length).toBeGreaterThan(0);
    expect(ofType(events, "hit")).toHaveLength(0);
  });

  it("expires at its range", () => {
    const world = duel();
    world.ships[1] = { ...world.ships[1]!, pos: { x: 1500, y: 800 } };
    const { world: after } = run(world, 0.05, [input({ aim: { x: 0, y: -1 }, fire: true })]);
    expect(after.shots).toHaveLength(1);
    const later = run(after, 2, [input({ aim: { x: 0, y: -1 } })]).world;
    expect(later.shots).toHaveLength(0);
  });
});

describe("shield", () => {
  it("blocks shots and drains the shared bar", () => {
    const { world, events } = run(duel(), 1, [input({ fire: true }), input({ shield: true })]);
    expect(ofType(events, "hit")).toHaveLength(0);
    expect(ofType(events, "shotBlocked").length).toBeGreaterThan(0);
    expect(ofType(events, "shieldRaised")).toEqual([{ type: "shieldRaised", ship: 1 }]);
    expect(world.ships[1]!.health).toBe(TUNING.ship.maxHealth);
    expect(world.ships[1]!.energy).toBeLessThan(TUNING.energy.max);
  });

  it("wins over fire: a gunner holding both doesn't shoot", () => {
    const { events } = run(duel(), 1, [input({ fire: true, shield: true })]);
    expect(ofType(events, "shotFired")).toHaveLength(0);
  });

  it("stops working once the bar is empty", () => {
    const world = duel();
    world.ships[1] = { ...world.ships[1]!, energy: 1 };
    const { events } = run(world, 1, [input({ fire: true }), input({ shield: true })]);
    expect(ofType(events, "energyEmpty")).toEqual([{ type: "energyEmpty", ship: 1 }]);
    expect(ofType(events, "hit").length).toBeGreaterThan(0);
  });
});

describe("sinking and respawn", () => {
  const sinkShip1 = () => run(duel(), 3, (w) => [input({ fire: !w.ships[1]!.sunk })]);

  it("sinks a ship after enough hits and credits the attacker", () => {
    const { world, events } = sinkShip1();
    expect(ofType(events, "hit")).toHaveLength(TUNING.ship.maxHealth / shotDamage);
    expect(ofType(events, "sunk")).toEqual([{ type: "sunk", ship: 1, by: 0 }]);
    expect(world.ships[0]!.sinkings).toBe(1);
  });

  it(`respawns after ${TUNING.respawn.delay} s at the spawn point farthest from the enemy`, () => {
    let { world } = run(duel(), 2, (w) => [input({ fire: !w.ships[1]!.sunk })]);
    while (!world.ships[1]!.sunk) world = step(world, [input({ fire: true })], DT).world;

    const before = run(world, TUNING.respawn.delay - DT, []);
    expect(before.world.ships[1]!.sunk).toBe(true);
    expect(ofType(before.events, "respawned")).toHaveLength(0);

    const after = run(before.world, DT, []);
    expect(after.world.ships[1]!.sunk).toBe(false);
    // Ship 0 sits at (400, 200), near the top-left spawn point, so the bottom-right one is farthest.
    expect(ofType(after.events, "respawned")).toEqual([{ type: "respawned", ship: 1, pos: SPAWN_POINTS[3] }]);
    expect(after.world.ships[1]!.health).toBe(TUNING.ship.maxHealth);
  });

  it("ignores input and collisions while sunk", () => {
    const { world } = sinkShip1();
    const sunkPos = world.ships[1]!.pos;
    const moved = run(world, 0.5, [undefined, input({ steer: { x: 1, y: 0 }, fire: true })]);
    expect(moved.world.ships[1]!.pos).toEqual(sunkPos);
    expect(ofType(moved.events, "shotFired")).toHaveLength(0);
  });

  it(`protects a respawned ship for ${TUNING.respawn.protection} s`, () => {
    const world = duel();
    world.ships[1] = { ...world.ships[1]!, protection: TUNING.respawn.protection };
    const during = run(world, 1, [input({ fire: true })]);
    expect(ofType(during.events, "hit")).toHaveLength(0);
    expect(during.world.ships[1]!.health).toBe(TUNING.ship.maxHealth);

    const after = run(during.world, 1.5, [input({ fire: true })]);
    expect(ofType(after.events, "protectionEnded")).toEqual([{ type: "protectionEnded", ship: 1 }]);
    expect(ofType(after.events, "hit").length).toBeGreaterThan(0);
  });

  it("ends protection early when the protected ship fires", () => {
    const world = duel();
    world.ships[1] = { ...world.ships[1]!, protection: TUNING.respawn.protection };
    const { world: after, events } = run(world, 0.1, [undefined, input({ fire: true })]);
    expect(after.ships[1]!.protection).toBe(0);
    expect(ofType(events, "protectionEnded")).toEqual([{ type: "protectionEnded", ship: 1 }]);
  });
});

describe("bumps", () => {
  /** Ships 0 and 1 boosting head-on toward each other along y = 200. */
  const ram = () => run(duel(), 1.5, [input({ steer: { x: 1, y: 0 }, boost: true }), input({ steer: { x: -1, y: 0 }, boost: true })]);

  it("damages both ships once per contact, scaled by closing speed", () => {
    const { world, events } = ram();
    const bumps = ofType(events, "bump");
    expect(bumps).toHaveLength(1);
    const [dmgA, dmgB] = bumps[0]!.damage;
    expect(dmgA).toBeGreaterThan(0);
    expect(dmgA).toBeLessThanOrEqual(TUNING.bump.maxDamage);
    expect(dmgB).toBeCloseTo(dmgA);
    expect(world.ships[0]!.health).toBeCloseTo(TUNING.ship.maxHealth - dmgA);
  });

  it("does nothing for a gentle nudge", () => {
    const { events } = run(duel(), 4, [input({ steer: { x: 0.2, y: 0 } })]);
    const bumps = ofType(events, "bump");
    for (const bump of bumps) expect(bump.damage).toEqual([0, 0]);
  });

  it("is blocked by shield and by protection", () => {
    const world = duel();
    world.ships[1] = { ...world.ships[1]!, protection: 5 };
    const { events } = run(world, 1.5, [input({ steer: { x: 1, y: 0 }, boost: true, shield: true }), input({ steer: { x: -1, y: 0 }, boost: true })]);
    expect(ofType(events, "bump")[0]!.damage).toEqual([0, 0]);
  });

  it("credits the other ship when a bump sinks", () => {
    const world = duel();
    world.ships[1] = { ...world.ships[1]!, health: 1 };
    const { world: after, events } = run(world, 1.5, [input({ steer: { x: 1, y: 0 }, boost: true }), input({ steer: { x: -1, y: 0 }, boost: true })]);
    expect(ofType(events, "sunk")).toEqual([{ type: "sunk", ship: 1, by: 0 }]);
    expect(after.ships[0]!.sinkings).toBe(1);
  });
});

describe("match timer", () => {
  it(`ends after ${TUNING.match.duration} s with the result, then stops changing`, () => {
    const world = { ...createWorld(), time: TUNING.match.duration - 2 * DT };
    world.ships[0] = { ...world.ships[0]!, sinkings: 2 };
    const first = step(world, [], DT);
    expect(first.world.over).toBe(false);
    const last = step(first.world, [], DT);
    expect(last.world.over).toBe(true);
    expect(last.events).toContainEqual({ type: "matchEnded", winner: 0 });

    const afterEnd = step(last.world, [input({ steer: { x: 1, y: 0 }, fire: true })], DT);
    expect(afterEnd.world).toBe(last.world);
    expect(afterEnd.events).toEqual([]);
  });

  it("reports a draw when sinkings are equal", () => {
    const world = { ...createWorld(), time: TUNING.match.duration - DT };
    expect(step(world, [], DT).events).toContainEqual({ type: "matchEnded", winner: null });
  });
});
