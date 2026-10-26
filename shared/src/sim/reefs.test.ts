import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { pointInPolygon } from "./geometry.ts";
import { LAYOUTS, LAYOUT_IDS, reefsFor } from "./layouts.ts";
import { createWorld } from "./match.ts";
import { steerShip } from "./ship.ts";
import { step } from "./step.ts";
import { testShip } from "./testShip.ts";
import type { ShipInput, SimEvent, World } from "./types.ts";
import { length } from "./vec.ts";

const DT = 0.05;
const FULL = TUNING.ship.maxHealth;
const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const east = (boost = false): ShipInput => ({ ...idle, pilot: { steer: { x: 1, y: 0 }, boost } });

/** One Island with hazards on: its reef off the island's top-left corner is centred on (700, 275). */
const REEF = { x: 700, y: 275 };
function world(setUp: (w: World) => void = () => {}, options: Parameters<typeof createWorld>[0] = { hazards: true }): World {
  const w = createWorld(options);
  // Ship 1 parked far away, out of the way.
  w.ships[1] = { ...w.ships[1]!, pos: { x: 1450, y: 800 } };
  setUp(w);
  return w;
}

function run(w: World, seconds: number, inputs: (w: World) => ShipInput[]) {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = step(w, inputs(w), DT);
    w = r.world;
    events.push(...r.events);
  }
  return { world: w, events };
}

describe("reef setting", () => {
  it("hazards off (the default) means no reefs, whatever the setting", () => {
    expect(createWorld().reefs).toEqual([]);
    expect(createWorld({ reefs: "all" }).reefs).toEqual([]);
    expect(createWorld().hazardsOn).toBe(false);
  });

  it("with hazards on: All (default), Few or None of the layout's reefs", () => {
    expect(createWorld({ hazards: true }).reefs).toBe(LAYOUTS.oneIsland.reefs);
    expect(createWorld({ hazards: true, reefs: "few", layout: "ring" }).reefs).toBe(LAYOUTS.ring.fewReefs);
    expect(createWorld({ hazards: true, reefs: "none" }).reefs).toEqual([]);
    for (const id of LAYOUT_IDS) expect(reefsFor(id, "all")).toBe(LAYOUTS[id].reefs);
  });
});

describe("a ship on a reef", () => {
  it(`has ${TUNING.reef.speedFactor * 100}% of its top speed (centre over the reef), boosted or not`, () => {
    for (const boost of [false, true]) {
      const top = TUNING.ship.maxSpeed * (boost ? TUNING.boost.speedMultiplier : 1);
      let ship = testShip({ vel: { x: top, y: 0 } });
      for (let i = 0; i < 60; i++) ship = steerShip(ship, east(boost).pilot, boost, DT, TUNING.reef.speedFactor);
      expect(length(ship.vel)).toBeCloseTo(top * TUNING.reef.speedFactor, 0);
    }
  });

  it(`takes ${TUNING.reef.damage * 100}% of full health on entering, once, and again after leaving and coming back`, () => {
    // Sail east through the reef from just west of it.
    const start = world((w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: REEF.x - 100, y: REEF.y }, heading: 0 }; });
    // (Stop once past it: the mirror-image reef at (900, 275) is further east.)
    const { world: after, events } = run(start, 3, (w) => [w.ships[0]!.pos.x < REEF.x + 70 ? east() : idle, idle]);
    const hits = events.filter((e) => e.type === "reefHit");
    expect(hits).toEqual([{ type: "reefHit", ship: 0, damage: FULL * TUNING.reef.damage }]);
    expect(after.ships[0]!.health).toBeCloseTo(FULL * (1 - TUNING.reef.damage));
    expect(pointInPolygon(after.ships[0]!.pos, LAYOUTS.oneIsland.reefs[0]!)).toBe(false);

    // Back west through it: a second hit.
    const west: ShipInput = { ...idle, pilot: { steer: { x: -1, y: 0 }, boost: false } };
    const turned = { ...after, ships: [{ ...after.ships[0]!, pos: { x: REEF.x + 100, y: REEF.y }, vel: { x: 0, y: 0 }, heading: Math.PI }, after.ships[1]!] };
    const back = run(turned, 3, (w) => [w.ships[0]!.pos.x > REEF.x - 70 ? west : idle, idle]);
    expect(back.events.filter((e) => e.type === "reefHit")).toHaveLength(1);
  });

  it("slows a ship sailing across it", () => {
    const start = world((w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: REEF.x - 100, y: REEF.y }, vel: { x: TUNING.ship.maxSpeed, y: 0 }, heading: 0 }; });
    const crossing = run(start, 1, () => [east(), idle]).world;
    const open = run(world((w) => { w.ships[0] = { ...start.ships[0]! }; }, { hazards: false }), 1, () => [east(), idle]).world;
    expect(crossing.ships[0]!.pos.x).toBeLessThan(open.ships[0]!.pos.x - 20);
  });

  it("respawn protection blocks the hit; a raised shield doesn't", () => {
    const protectedShip = world((w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: REEF.x - 60, y: REEF.y }, heading: 0, protection: 2 }; });
    const a = run(protectedShip, 1, () => [east(), idle]);
    expect(a.events.filter((e) => e.type === "reefHit")).toEqual([]);
    expect(a.world.ships[0]!.health).toBe(FULL);

    const shielded = world((w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: REEF.x - 60, y: REEF.y }, heading: 0 }; });
    const shield: ShipInput = { ...east(), gunner: { ...idle.gunner, shield: true } };
    const b = run(shielded, 1, () => [shield, idle]);
    expect(b.events.filter((e) => e.type === "reefHit")).toHaveLength(1);
  });

  it("sinking on a reef credits nobody (cause reef), and costs a life in Last Afloat", () => {
    const low = (w: World) => { w.ships[0] = { ...w.ships[0]!, pos: { x: REEF.x - 60, y: REEF.y }, heading: 0, health: 1 }; };
    const sc = run(world(low), 1, () => [east(), idle]);
    expect(sc.events).toContainEqual({ type: "sunk", ship: 0, by: null, cause: "reef" });
    expect(sc.world.ships.map((s) => s.sinkings)).toEqual([0, 0]);

    const la = run(world(low, { hazards: true, mode: "lastAfloat", lives: 2 }), 1, () => [east(), idle]);
    expect(la.events).toContainEqual({ type: "sunk", ship: 0, by: null, cause: "reef", livesLeft: 1 });
  });

  it("leaves shots alone: they pass over reefs", () => {
    const w = world((w) => {
      w.ships[0] = { ...w.ships[0]!, pos: { x: REEF.x - 250, y: REEF.y }, turret: 0 };
      w.ships[1] = { ...w.ships[1]!, pos: { x: REEF.x + 250, y: REEF.y } };
    });
    const fire: ShipInput = { ...idle, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } };
    const { events } = run(w, 1.5, () => [fire, idle]);
    expect(events.some((e) => e.type === "hit" && e.target === 1)).toBe(true);
  });
});
