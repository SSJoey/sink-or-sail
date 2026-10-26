import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { LAYOUTS, LAYOUT_IDS } from "./layouts.ts";
import { SEA_CENTRE, SPAWN_POINTS } from "./map.ts";
import { createWorld } from "./match.ts";
import { step } from "./step.ts";
import { DEFAULT_STORM_TIMES, inStorm, respawnInside, stormRadius, stormTicks } from "./storm.ts";
import type { ShipInput, SimEvent, World } from "./types.ts";
import { distance } from "./vec.ts";
import { wreckHull } from "./wrecks.ts";

const DT = 0.05;
const S = TUNING.closingStorm;
const FULL = TUNING.ship.maxHealth;
const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const storm = DEFAULT_STORM_TIMES;

/** A Last Afloat world with hazards on (so the storm), at match time `time`. */
function world(time: number, setUp: (w: World) => void = () => {}, lives = 2): World {
  const w = createWorld({ mode: "lastAfloat", hazards: true, lives });
  w.time = time;
  setUp(w);
  return w;
}

function run(w: World, seconds: number, inputs: (w: World) => ShipInput[] = () => [idle, idle]) {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = step(w, inputs(w), DT);
    w = r.world;
    events.push(...r.events);
    if (w.over) break;
  }
  return { world: w, events };
}
const ofType = <T extends SimEvent["type"]>(events: SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
/** A spot `r` from the middle of the sea, toward the top-left corner. */
const towardCorner = (r: number) => {
  const c = SPAWN_POINTS[0]!;
  const d = distance(c, SEA_CENTRE);
  return { x: SEA_CENTRE.x + ((c.x - SEA_CENTRE.x) * r) / d, y: SEA_CENTRE.y + ((c.y - SEA_CENTRE.y) * r) / d };
};

describe("the closing storm's circle", () => {
  it(`covers the whole sea until ${S.startsAt} s, shrinks smoothly to ${S.endRadius} by ${S.closedAt} s, then stays`, () => {
    expect(S.startRadius).toBeGreaterThan(distance({ x: 0, y: 0 }, SEA_CENTRE));
    expect(stormRadius(storm, 0)).toBe(S.startRadius);
    expect(stormRadius(storm, S.startsAt)).toBe(S.startRadius);
    expect(stormRadius(storm, (S.startsAt + S.closedAt) / 2)).toBeCloseTo((S.startRadius + S.endRadius) / 2);
    expect(stormRadius(storm, S.closedAt)).toBe(S.endRadius);
    expect(stormRadius(storm, TUNING.lastAfloat.duration)).toBe(S.endRadius);
    for (let t = S.startsAt; t < S.closedAt; t += 7) expect(stormRadius(storm, t + 7)).toBeLessThan(stormRadius(storm, t));
  });

  it("puts a ship in the storm when its centre is outside the circle", () => {
    expect(inStorm(towardCorner(299), 300)).toBe(false);
    expect(inStorm(towardCorner(301), 300)).toBe(true);
  });

  it(`ticks every ${S.tickSeconds} s once it starts closing`, () => {
    expect(stormTicks(storm, 0, S.startsAt)).toBe(0);
    expect(stormTicks(storm, S.startsAt, S.startsAt + 0.99)).toBe(0);
    expect(stormTicks(storm, S.startsAt + 0.99, S.startsAt + 1.04)).toBe(1);
    expect(stormTicks(storm, S.startsAt, S.startsAt + 10)).toBe(10);
  });
});

describe("the storm in a match", () => {
  it("comes only in Last Afloat with hazards on", () => {
    expect(createWorld({ mode: "lastAfloat", hazards: true }).storm).toEqual(DEFAULT_STORM_TIMES);
    expect(createWorld({ mode: "lastAfloat" }).storm).toBeNull();
    expect(createWorld({ hazards: true }).storm).toBeNull();
    expect(createWorld().storm).toBeNull();
    expect(createWorld({ mode: "lastAfloat", hazards: true, storm: { startsAt: 2, closedAt: 12 } }).storm).toEqual({ startsAt: 2, closedAt: 12 });
  });

  it("signals when it starts closing and when it reaches its final circle", () => {
    const start = run(world(S.startsAt - 0.5), 1);
    expect(ofType(start.events, "stormStarted")).toHaveLength(1);
    const closed = run(world(S.closedAt - 0.5), 1);
    expect(ofType(closed.events, "stormClosed")).toHaveLength(1);
    expect(ofType(run(world(10), 5).events, "stormStarted")).toEqual([]);
  });

  it(`takes ${S.damage * 100}% of full health each second from ships outside the circle, and none from ships inside`, () => {
    // At 4:00 the circle is well inside the starts (which are 650 from the middle); ship 1 waits in the middle.
    const w = world(240, (w) => { w.ships[1] = { ...w.ships[1]!, pos: { x: SEA_CENTRE.x, y: SEA_CENTRE.y - 200 } }; });
    expect(inStorm(w.ships[0]!.pos, stormRadius(storm, 240))).toBe(true);
    const { world: after, events } = run(w, 3);
    expect(ofType(events, "stormDamage")).toEqual([0, 1, 2].map(() => ({ type: "stormDamage", ship: 0, damage: FULL * S.damage })));
    expect(after.ships[0]!.health).toBeCloseTo(FULL * (1 - 3 * S.damage));
    expect(after.ships[1]!.health).toBe(FULL);
  });

  it("does no damage before it starts closing, even to a ship in a corner", () => {
    const w = world(0, (w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: 40, y: 40 } }; });
    expect(ofType(run(w, 10).events, "stormDamage")).toEqual([]);
  });

  it("respawn protection blocks it; a raised shield doesn't", () => {
    const protectedShip = world(240, (w) => { w.ships[0] = { ...w.ships[0]!, protection: 2 }; });
    expect(ofType(run(protectedShip, 1.5).events, "stormDamage").filter((e) => e.ship === 0)).toEqual([]);
    const shield: ShipInput = { ...idle, gunner: { ...idle.gunner, shield: true } };
    expect(ofType(run(world(240), 1.5, () => [shield, idle]).events, "stormDamage").filter((e) => e.ship === 0)).toHaveLength(1);
  });

  it("sinking in it credits nobody (cause storm) and costs a life; on the last life the crew is out", () => {
    const low = (w: World) => { w.ships[0] = { ...w.ships[0]!, health: 1 }; };
    const a = run(world(240, low), 1.5);
    expect(a.events).toContainEqual({ type: "sunk", ship: 0, by: null, cause: "storm", livesLeft: 1 });
    expect(a.world.ships.map((s) => s.sinkings)).toEqual([0, 0]);
    const b = run(world(240, low, 1), 1.5);
    expect(b.events).toContainEqual({ type: "crewOut", ship: 0 });
  });

  it("isn't in Sink Count: a ship in a corner takes nothing all match", () => {
    const w = createWorld({ hazards: true });
    w.time = 230;
    w.ships[0] = { ...w.ships[0]!, pos: { x: 40, y: 40 } };
    expect(ofType(run(w, 10).events, "stormDamage")).toEqual([]);
  });
});

describe("respawning while the storm closes", () => {
  it("comes back at its corner while that is well inside the circle", () => {
    expect(respawnInside(SPAWN_POINTS[0]!, S.startRadius, [])).toEqual(SPAWN_POINTS[0]);
  });

  it(`otherwise comes back pulled in toward the middle, ${S.respawnInset} inside the circle`, () => {
    const pos = respawnInside(SPAWN_POINTS[0]!, 500, []);
    expect(distance(pos, SEA_CENTRE)).toBeCloseTo(500 - S.respawnInset);
    expect(distance(towardCorner(500 - S.respawnInset), pos)).toBeLessThan(0.01);
  });

  it("is always inside the circle and clear of islands and wrecks, on every layout, from every corner, at every size", () => {
    for (const id of LAYOUT_IDS) {
      const solids = [...LAYOUTS[id].islands, ...LAYOUTS[id].wrecks.map(wreckHull)];
      for (const corner of SPAWN_POINTS) {
        for (let radius = S.startRadius; radius >= S.endRadius; radius -= 20) {
          const pos = respawnInside(corner, radius, solids);
          expect(distance(pos, SEA_CENTRE), `${id} ${radius}`).toBeLessThanOrEqual(Math.min(radius - S.respawnInset, distance(corner, SEA_CENTRE)) + 0.01);
          for (const solid of solids) expect(circleOverlapsPolygon(pos, TUNING.ship.radius, solid), `${id} ${radius} ${JSON.stringify(pos)}`).toBeNull();
        }
      }
    }
  });

  it("a ship sunk in the storm respawns inside the circle, with protection", () => {
    const w = world(240, (w) => { w.ships[0] = { ...w.ships[0]!, sunk: true, respawnIn: 0.01, health: 0 }; });
    const { world: after, events } = run(w, 0.1);
    const back = ofType(events, "respawned")[0]!;
    expect(distance(back.pos, SEA_CENTRE)).toBeLessThanOrEqual(stormRadius(storm, 240) - S.respawnInset + 0.01);
    expect(after.ships[0]!.protection).toBeGreaterThan(0);
  });
});
