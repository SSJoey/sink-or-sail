import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { placeHazard, inMovingStorm } from "./hazards.ts";
import { LAYOUTS, LAYOUT_IDS } from "./layouts.ts";
import { createWorld, type WorldOptions } from "./match.ts";
import { step } from "./step.ts";
import type { Hazard, ShipInput, SimEvent, World } from "./types.ts";
import { angleOf, distance, fromAngle, sub, type Vec } from "./vec.ts";
import { wreckHull } from "./wrecks.ts";

const DT = 0.05;
const H = TUNING.hazards;
const M = TUNING.movingStorm;
const W = TUNING.whirlpool;
const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const ofType = <E extends SimEvent, T extends SimEvent["type"]>(events: E[], type: T) => events.filter((e): e is E & Extract<SimEvent, { type: T }> => e.type === type);

/** Runs idle ships for `seconds`, keeping each event with the match time it happened at. */
function run(w: World, seconds: number, each: (w: World) => void = () => {}) {
  const events: (SimEvent & { at: number })[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = step(w, [idle, idle, idle], DT);
    w = r.world;
    events.push(...r.events.map((e) => ({ ...e, at: w.time })));
    each(w);
    if (w.over) break;
  }
  return { world: w, events };
}

const hazardsOn = (options: WorldOptions = {}) => createWorld({ hazards: true, ...options });

/** A world with no hazard timer, holding one hand-placed storm. */
function withStorm(storm: Partial<Hazard>, setUp: (w: World) => void = () => {}): World {
  const w = hazardsOn();
  w.nextHazardIn = null;
  w.hazards = [{ id: 0, kind: "movingStorm", pos: { x: 800, y: 150 }, heading: 0, phase: "active", timeLeft: 10, spin: 0, ...storm }];
  w.nextHazardId = 1;
  setUp(w);
  return w;
}

describe("the hazard timer", () => {
  it("never runs with hazards off, or when turned off for the match", () => {
    expect(createWorld().nextHazardIn).toBeNull();
    expect(hazardsOn({ firstHazardAt: null }).nextHazardIn).toBeNull();
    for (const w of [createWorld(), createWorld({ mode: "lastAfloat" }), hazardsOn({ firstHazardAt: null })]) {
      const { events, world } = run(w, 120);
      expect(ofType(events, "hazardSignalled")).toEqual([]);
      expect(world.hazards).toEqual([]);
    }
  });

  it(`signals the first hazard ${H.firstAt} s in, in both modes`, () => {
    for (const mode of ["sinkCount", "lastAfloat"] as const) {
      const signalled = ofType(run(hazardsOn({ mode }), H.firstAt + 1).events, "hazardSignalled");
      expect(signalled).toHaveLength(1);
      expect(signalled[0]!.at).toBeCloseTo(H.firstAt, 5);
      expect(["movingStorm", "whirlpool"]).toContain(signalled[0]!.kind);
    }
    expect(hazardsOn({ firstHazardAt: 2 }).nextHazardIn).toBe(2);
  });

  it("the same seed gives the same hazards; another seed different ones", () => {
    const hazards = (seed: number) => ofType(run(hazardsOn({ seed }), 200).events, "hazardSignalled");
    expect(hazards(5)).toEqual(hazards(5));
    expect(hazards(5)).not.toEqual(hazards(6));
  });

  it("has its own copy of the seed: the packs' generator is untouched", () => {
    const w = hazardsOn({ packs: true, seed: 9 });
    w.time = H.firstAt - DT / 2;
    w.nextHazardIn = DT / 2;
    w.nextSignalIn = 100;
    const after = step(w, [idle, idle], DT);
    expect(ofType(after.events, "hazardSignalled")).toHaveLength(1);
    expect(after.world.rng).toBe(w.rng);
    expect(after.world.hazardRng).not.toBe(w.hazardRng);
  });

  it(`keeps at most ${H.maxActive} on the sea, and the next comes ${H.minGap}–${H.maxGap} s after the previous one is gone`, () => {
    const { events } = run(hazardsOn({ seed: 3 }), TUNING.match.duration, (w) => expect(w.hazards.length).toBeLessThanOrEqual(H.maxActive));
    const signalled = ofType(events, "hazardSignalled");
    const ended = ofType(events, "hazardEnded");
    expect(signalled.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < signalled.length; i++) {
      const gone = ended[i - 1]!.at + M.fadeTime;
      expect(signalled[i]!.at - gone).toBeGreaterThanOrEqual(H.minGap - 0.1);
      expect(signalled[i]!.at - gone).toBeLessThanOrEqual(H.maxGap + 0.1);
    }
  });

  it(`is signalled for ${H.signalTime} s before it acts, and doesn't move meanwhile`, () => {
    const w = hazardsOn({ firstHazardAt: 1 });
    const { events, world } = run(w, 1 + H.signalTime - 0.5);
    const signalled = ofType(events, "hazardSignalled")[0]!;
    expect(world.hazards[0]).toMatchObject({ phase: "signalled", pos: signalled.pos });
    const later = run(world, 1).events;
    const started = ofType(later, "hazardStarted")[0]!;
    expect(started.at - signalled.at).toBeCloseTo(H.signalTime, 1);
  });

  it("tries again a second later when no ship is afloat", () => {
    const w = hazardsOn({ firstHazardAt: 1 });
    w.ships = w.ships.map((s) => ({ ...s, sunk: true, respawnIn: 100 }));
    const { world, events } = run(w, 1.5);
    expect(ofType(events, "hazardSignalled")).toEqual([]);
    expect(world.nextHazardIn).toBeCloseTo(H.retryAfter - 0.5, 5);
  });
});

describe("which hazard comes", () => {
  it("is picked with the seed, moving storms and whirlpools about equally often", () => {
    const firsts = Array.from({ length: 100 }, (_, seed) => ofType(run(hazardsOn({ seed, firstHazardAt: 0.05 }), 0.1).events, "hazardSignalled")[0]!.kind);
    const whirlpools = firsts.filter((k) => k === "whirlpool").length;
    expect(whirlpools).toBeGreaterThan(30);
    expect(whirlpools).toBeLessThan(70);
    const again = Array.from({ length: 100 }, (_, seed) => ofType(run(hazardsOn({ seed, firstHazardAt: 0.05 }), 0.1).events, "hazardSignalled")[0]!.kind);
    expect(again).toEqual(firsts);
  });

  it("gives a whirlpool a spin picked with the seed, both ways", () => {
    const spins = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const s = ofType(run(hazardsOn({ seed, firstHazardAt: 0.05 }), 0.1).events, "hazardSignalled")[0]!;
      if (s.kind === "whirlpool") spins.add(s.spin!);
      else expect(s.spin).toBeUndefined();
    }
    expect([...spins].sort()).toEqual([-1, 1]);
  });
});

describe("where a moving storm appears", () => {
  it(`${H.distanceFromShip} from a ship, its edge ${H.clearance} clear of every ship, inside the sea, heading for that ship — every layout, many seeds`, () => {
    for (const id of LAYOUT_IDS) {
      for (const three of [false, true]) {
        const ships = createWorld({ layout: id, ships: three ? 3 : 2 }).ships;
        for (let seed = 0; seed < 50; seed++) {
          const placed = placeHazard("movingStorm", ships, seed, []).value;
          expect(placed, `${id} ${seed}`).not.toBeNull();
          const { pos, heading, ship } = placed!;
          expect(distance(pos, ships[ship]!.pos)).toBeCloseTo(H.distanceFromShip);
          expect(heading).toBeCloseTo(angleOf(sub(ships[ship]!.pos, pos)));
          for (const s of ships) expect(distance(pos, s.pos)).toBeGreaterThanOrEqual(M.radius + TUNING.ship.radius + H.clearance);
          expect(pos.x).toBeGreaterThanOrEqual(M.radius);
          expect(pos.y).toBeGreaterThanOrEqual(M.radius);
          expect(pos.x).toBeLessThanOrEqual(TUNING.sea.width - M.radius);
          expect(pos.y).toBeLessThanOrEqual(TUNING.sea.height - M.radius);
        }
      }
    }
  });

  it("only picks ships that are afloat", () => {
    const ships = createWorld().ships.map((s, i) => (i === 0 ? { ...s, sunk: true } : s));
    for (let seed = 0; seed < 30; seed++) expect(placeHazard("movingStorm", ships, seed, []).value!.ship).toBe(1);
    expect(placeHazard("movingStorm", ships.map((s) => ({ ...s, sunk: true })), 1, []).value).toBeNull();
  });

  it("may lie over islands (it's weather)", () => {
    // Ship 0 waits just above One Island.
    const islands = LAYOUTS.oneIsland.islands;
    const ships = createWorld().ships.map((s, i) => (i === 0 ? { ...s, pos: { x: 820, y: 290 } } : s));
    const overIsland = Array.from({ length: 200 }, (_, seed) => placeHazard("movingStorm", ships, seed, []).value!.pos)
      .some((pos) => islands.some((island) => circleOverlapsPolygon(pos, M.radius, island) !== null));
    expect(overIsland).toBe(true);
  });
});

describe("a moving storm", () => {
  it(`drifts at ${M.speed} along its heading while active`, () => {
    const { world } = run(withStorm({ heading: Math.PI / 2 }), 1);
    expect(world.hazards[0]!.pos.x).toBeCloseTo(800);
    expect(world.hazards[0]!.pos.y).toBeCloseTo(150 + M.speed);
  });

  it(`stops acting after ${M.lifetime} s (reason time), fades for ${M.fadeTime} s, then is gone`, () => {
    const w = withStorm({ phase: "signalled", timeLeft: DT / 2, pos: { x: 300, y: 450 }, heading: 0 });
    const { events, world } = run(w, M.lifetime + 0.5);
    const ended = ofType(events, "hazardEnded");
    expect(ended).toEqual([expect.objectContaining({ hazard: 0, kind: "movingStorm", reason: "time" })]);
    expect(ended[0]!.at).toBeCloseTo(DT + M.lifetime, 1);
    expect(world.hazards[0]!.phase).toBe("fading");
    expect(run(world, M.fadeTime).world.hazards).toEqual([]);
  });

  it("stops acting when its centre leaves the sea (reason edge)", () => {
    const { events } = run(withStorm({ pos: { x: TUNING.sea.width - 20, y: 450 }, heading: 0 }), 1);
    expect(ofType(events, "hazardEnded")).toEqual([expect.objectContaining({ hazard: 0, reason: "edge" })]);
  });

  it("swallows a waiting ship in its path (it pushes slower than it drifts)", () => {
    expect(M.push).toBeLessThan(M.speed);
    const w = withStorm({ pos: { x: 500, y: 150 }, heading: 0, timeLeft: 100 }, (w) => { w.wrecks = []; w.ships[0] = { ...w.ships[0]!, pos: { x: 800, y: 150 }, vel: { x: 0, y: 0 } }; });
    const { world } = run(w, (300 - M.radius) / M.speed + 3);
    expect(distance(world.ships[0]!.pos, world.hazards[0]!.pos)).toBeLessThan(M.radius - 20);
  });

  it("carries a ship whose centre is inside along its direction, and only while active; no damage", () => {
    const ship0 = { x: 800, y: 150 + M.radius - 5 };
    const pushed = run(withStorm({ heading: 0 }, (w) => { w.ships[0] = { ...w.ships[0]!, pos: ship0, vel: { x: 0, y: 0 } }; }), 0.5).world.ships[0]!;
    expect(pushed.pos.x - ship0.x).toBeGreaterThan(M.push * 0.5 * 0.9);
    expect(pushed.health).toBe(TUNING.ship.maxHealth);
    const outside = { x: 800, y: 150 + M.radius + 30 };
    const notPushed = run(withStorm({ heading: 0 }, (w) => { w.ships[0] = { ...w.ships[0]!, pos: outside, vel: { x: 0, y: 0 } }; }), 0.5).world.ships[0]!;
    expect(notPushed.pos).toEqual(outside);
    for (const phase of ["signalled", "fading"] as const) {
      const still = run(withStorm({ heading: 0, phase, timeLeft: 5 }, (w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: 800, y: 150 }, vel: { x: 0, y: 0 } }; }), 0.5).world.ships[0]!;
      expect(still.pos).toEqual({ x: 800, y: 150 });
    }
  });

  it("pushes protected ships too (it's a push, not damage)", () => {
    const w = withStorm({ heading: 0 }, (w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: 800, y: 150 }, vel: { x: 0, y: 0 }, protection: 2 }; });
    expect(run(w, 0.5).world.ships[0]!.pos.x).toBeGreaterThan(800 + M.push * 0.4);
  });

  it("can't push a ship into an island", () => {
    // One Island: a ship just above the island, pushed straight down for several seconds.
    const island = LAYOUTS.oneIsland.islands[0]!;
    const top = island.reduce((a, b) => (b.y < a.y ? b : a));
    const start = { x: top.x, y: top.y - TUNING.ship.radius - 2 };
    const w = withStorm({ pos: start, heading: Math.PI / 2, timeLeft: 100 }, (w) => { w.ships[0] = { ...w.ships[0]!, pos: start, vel: { x: 0, y: 0 } }; });
    run(w, 4, (w) => {
      expect(circleOverlapsPolygon(w.ships[0]!.pos, TUNING.ship.radius - 0.5, island)).toBeNull();
    });
  });

  it("says when a ship's centre enters and leaves it (leaving includes the storm ending)", () => {
    const moves = (events: SimEvent[]) => events.filter((e) => e.type === "stormEntered" || e.type === "stormLeft").map((e) => `${e.type} ${(e as { ship: number }).ship}`);
    // Ship 0 starts in the middle; the storm, drifting faster than it pushes, passes over it and leaves it behind.
    // (One Island's wrecks are taken away: one lies in its path.)
    const out = withStorm({ heading: 0, timeLeft: 100 }, (w) => { w.wrecks = []; w.ships[0] = { ...w.ships[0]!, pos: { x: 800, y: 150 }, vel: { x: 0, y: 0 } }; });
    const sailedOut = run(out, M.radius / (M.speed - M.push) + 2).events;
    expect(moves(sailedOut)).toEqual(["stormEntered 0", "stormLeft 0"]);
    expect(ofType(sailedOut, "stormLeft")[0]!.at).toBeCloseTo(M.radius / (M.speed - M.push), 0);
    // The storm ends with ship 0 still inside.
    const ends = withStorm({ heading: 0, timeLeft: 2 }, (w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: 800, y: 150 }, vel: { x: 0, y: 0 } }; });
    const ended = run(ends, 3).events;
    expect(moves(ended)).toEqual(["stormEntered 0", "stormLeft 0"]);
    expect(ofType(ended, "stormLeft")[0]!.at).toBeCloseTo(ofType(ended, "hazardEnded")[0]!.at);
    expect(ofType(ended, "stormEntered")[0]).toMatchObject({ ship: 0, hazard: 0 });
  });

  it("knows whether a spot is inside it (for drawing what it hides)", () => {
    const storm: Hazard = { id: 0, kind: "movingStorm", pos: { x: 100, y: 100 }, heading: 0, phase: "active", timeLeft: 1, spin: 0 };
    expect(inMovingStorm({ x: 100 + M.radius - 1, y: 100 }, storm)).toBe(true);
    expect(inMovingStorm({ x: 100 + M.radius + 1, y: 100 }, storm)).toBe(false);
  });
});

/** A world with no hazard timer, holding one hand-placed whirlpool (spinning clockwise) and ship 0 at `ship`. */
function withWhirlpool(pool: Partial<Hazard>, ship: Vec, setUp: (w: World) => void = () => {}): World {
  const w = hazardsOn();
  w.nextHazardIn = null;
  w.wrecks = [];
  w.hazards = [{ id: 0, kind: "whirlpool", pos: { x: 800, y: 150 }, heading: 0, phase: "active", timeLeft: 100, spin: 1, ...pool }];
  w.nextHazardId = 1;
  w.ships[0] = { ...w.ships[0]!, pos: ship, vel: { x: 0, y: 0 } };
  setUp(w);
  return w;
}
const CENTRE = { x: 800, y: 150 };
/** One step's movement of ship 0, split into inward (toward the middle) and clockwise parts. */
function oneStep(w: World) {
  const before = w.ships[0]!.pos;
  const after = step(w, [idle, idle], DT).world.ships[0]!.pos;
  const d = distance(before, CENTRE);
  const inward = { x: (CENTRE.x - before.x) / d, y: (CENTRE.y - before.y) / d };
  const clockwise = { x: inward.y, y: -inward.x };
  const move = sub(after, before);
  return { inward: (move.x * inward.x + move.y * inward.y) / DT, clockwise: (move.x * clockwise.x + move.y * clockwise.y) / DT };
}
const full = (angle: number, boost = false): ShipInput => ({ pilot: { steer: fromAngle(angle), boost }, gunner: idle.gunner });

describe("where a whirlpool appears", () => {
  it(`${W.distanceFromShip} from a ship, its reach ${H.clearance} clear of every ship, inside the sea, its eye clear of islands and wrecks — every layout, many seeds`, () => {
    for (const id of LAYOUT_IDS) {
      const solids = [...LAYOUTS[id].islands, ...LAYOUTS[id].wrecks.map(wreckHull)];
      for (const three of [false, true]) {
        const ships = createWorld({ layout: id, ships: three ? 3 : 2 }).ships;
        let placed = 0;
        for (let seed = 0; seed < 50; seed++) {
          const spot = placeHazard("whirlpool", ships, seed, solids).value;
          if (!spot) continue;
          placed++;
          expect(distance(spot.pos, ships[spot.ship]!.pos)).toBeCloseTo(W.distanceFromShip);
          for (const s of ships) expect(distance(spot.pos, s.pos)).toBeGreaterThanOrEqual(W.reach + TUNING.ship.radius + H.clearance);
          expect(Math.min(spot.pos.x, spot.pos.y, TUNING.sea.width - spot.pos.x, TUNING.sea.height - spot.pos.y)).toBeGreaterThanOrEqual(W.reach);
          for (const solid of solids) expect(circleOverlapsPolygon(spot.pos, W.eyeRadius, solid), `${id} ${seed}`).toBeNull();
        }
        expect(placed, `${id} ${three}`).toBeGreaterThan(40);
      }
    }
  });
});

describe("a whirlpool", () => {
  it("stays where it is, and ends after its time (reason time), then fades", () => {
    const { world, events } = run(withWhirlpool({ timeLeft: 2 }, { x: 150, y: 450 }), 2.5);
    expect(world.hazards[0]).toMatchObject({ pos: CENTRE, phase: "fading" });
    expect(ofType(events, "hazardEnded")).toEqual([expect.objectContaining({ kind: "whirlpool", reason: "time" })]);
  });

  it(`pulls a ship in at ${W.edgePull} at the edge of its reach, rising to ${W.innerPull} at the eye, and ${W.eyePull} inside the eye`, () => {
    // Ship 0 east of the middle (south of it is One Island).
    expect(oneStep(withWhirlpool({}, { x: 800 + W.reach - 1, y: 150 })).inward).toBeCloseTo(W.edgePull, 0);
    expect(oneStep(withWhirlpool({}, { x: 800 + W.eyeRadius + 1, y: 150 })).inward).toBeCloseTo(W.innerPull, 0);
    expect(oneStep(withWhirlpool({}, { x: 800 + W.eyeRadius - 10, y: 150 })).inward).toBeCloseTo(W.eyePull, 0);
    expect(oneStep(withWhirlpool({}, { x: 800 + W.reach + 5, y: 150 })).inward).toBeCloseTo(0, 9);
  });

  it(`swirls a ship round at ${W.swirl}, its way set by the spin`, () => {
    expect(oneStep(withWhirlpool({}, { x: 800, y: 250 })).clockwise).toBeCloseTo(W.swirl, 0);
    expect(oneStep(withWhirlpool({ spin: -1 }, { x: 800, y: 250 })).clockwise).toBeCloseTo(-W.swirl, 0);
  });

  it("does nothing while signalled or fading", () => {
    for (const phase of ["signalled", "fading"] as const) {
      const r = oneStep(withWhirlpool({ phase, timeLeft: 5 }, { x: 800, y: 250 }));
      expect(Math.abs(r.inward) + Math.abs(r.clockwise)).toBe(0);
    }
  });

  it("lets a ship at full sail get out from anywhere outside the eye", () => {
    // Sailing straight out (east) from just outside the eye.
    let w = withWhirlpool({}, { x: 800 + W.eyeRadius + 2, y: 150 }, (w) => { w.ships[0] = { ...w.ships[0]!, heading: 0, vel: { x: TUNING.ship.maxSpeed, y: 0 } }; });
    for (let i = 0; i < 100; i++) w = step(w, [full(0), idle], DT).world;
    expect(distance(w.ships[0]!.pos, CENTRE)).toBeGreaterThan(W.reach);
  });

  it("holds a ship in the eye at full sail; only boosting gets it out", () => {
    const start = { x: 800, y: 150 + W.eyeRadius - 15 };
    const setUp = (w: World) => { w.ships[0] = { ...w.ships[0]!, heading: Math.PI / 2, vel: { x: 0, y: TUNING.ship.maxSpeed } }; };
    let sailing = withWhirlpool({}, start, setUp);
    for (let i = 0; i < 60; i++) sailing = step(sailing, [full(Math.PI / 2), idle], DT).world;
    expect(distance(sailing.ships[0]!.pos, CENTRE)).toBeLessThan(W.eyeRadius);
    let boosting = withWhirlpool({}, start, setUp);
    for (let i = 0; i < 60; i++) boosting = step(boosting, [full(Math.PI / 2, true), idle], DT).world;
    expect(distance(boosting.ships[0]!.pos, CENTRE)).toBeGreaterThan(W.eyeRadius + 50);
  });

  it("is faster to sail round with the swirl than against it (the slingshot)", () => {
    // Ship 0 at the east edge of the reach, sailing south (clockwise) or north (anticlockwise) at full speed.
    const travel = (angle: number) => {
      let w = withWhirlpool({}, { x: 800 + 150, y: 150 }, (w) => { w.ships[0] = { ...w.ships[0]!, heading: angle, vel: { x: Math.cos(angle) * TUNING.ship.maxSpeed, y: Math.sin(angle) * TUNING.ship.maxSpeed } }; });
      const before = w.ships[0]!.pos;
      for (let i = 0; i < 10; i++) w = step(w, [full(angle), idle], DT).world;
      return distance(before, w.ships[0]!.pos);
    };
    expect(travel(Math.PI / 2)).toBeGreaterThan(travel(-Math.PI / 2) + 50);
  });

  it("does no damage, even holding a ship in the eye; protected ships are pulled too", () => {
    const { world } = run(withWhirlpool({}, { x: 800, y: 160 }, (w) => { w.ships[0] = { ...w.ships[0]!, protection: 2 }; }), 5);
    expect(world.ships[0]!.health).toBe(TUNING.ship.maxHealth);
    expect(distance(world.ships[0]!.pos, CENTRE)).toBeLessThan(W.eyeRadius);
  });

  it("can't pull a ship into an island", () => {
    // One Island: ship 0 left of the island, the whirlpool's middle up and right of it, across the island's corner.
    const island = LAYOUTS.oneIsland.islands[0]!;
    const w = withWhirlpool({ pos: { x: 740, y: 340 } }, { x: 630, y: 450 });
    run(w, 4, (w) => expect(circleOverlapsPolygon(w.ships[0]!.pos, TUNING.ship.radius - 0.5, island)).toBeNull());
  });

  it("says when a ship's centre enters and leaves its reach (leaving includes it ending)", () => {
    // Ship 0 drifts in from just outside the reach.
    const w = withWhirlpool({ timeLeft: 2 }, { x: 800, y: 150 + W.reach + 3 }, (w) => { w.ships[0] = { ...w.ships[0]!, vel: { x: 0, y: -100 } }; });
    const { events } = run(w, 3);
    const moves = events.filter((e) => e.type === "whirlpoolEntered" || e.type === "whirlpoolLeft").map((e) => e.type);
    expect(moves).toEqual(["whirlpoolEntered", "whirlpoolLeft"]);
    expect(ofType(events, "whirlpoolEntered")[0]).toMatchObject({ ship: 0, hazard: 0 });
    expect(ofType(events, "whirlpoolLeft")[0]!.at).toBeCloseTo(ofType(events, "hazardEnded")[0]!.at);
    expect(ofType(events, "stormEntered")).toEqual([]);
  });
});
