import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { placeMovingStorm, inMovingStorm } from "./hazards.ts";
import { LAYOUTS, LAYOUT_IDS } from "./layouts.ts";
import { createWorld, type WorldOptions } from "./match.ts";
import { step } from "./step.ts";
import type { Hazard, ShipInput, SimEvent, World } from "./types.ts";
import { angleOf, distance, sub } from "./vec.ts";

const DT = 0.05;
const H = TUNING.hazards;
const M = TUNING.movingStorm;
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
  w.hazards = [{ id: 0, kind: "movingStorm", pos: { x: 800, y: 150 }, heading: 0, phase: "active", timeLeft: 10, ...storm }];
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
      expect(signalled[0]!.kind).toBe("movingStorm");
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

describe("where a moving storm appears", () => {
  it(`${H.distanceFromShip} from a ship, its edge ${H.clearance} clear of every ship, inside the sea, heading for that ship — every layout, many seeds`, () => {
    for (const id of LAYOUT_IDS) {
      for (const three of [false, true]) {
        const ships = createWorld({ layout: id, ships: three ? 3 : 2 }).ships;
        for (let seed = 0; seed < 50; seed++) {
          const placed = placeMovingStorm(ships, seed).value;
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
    for (let seed = 0; seed < 30; seed++) expect(placeMovingStorm(ships, seed).value!.ship).toBe(1);
    expect(placeMovingStorm(ships.map((s) => ({ ...s, sunk: true })), 1).value).toBeNull();
  });

  it("may lie over islands (it's weather)", () => {
    // Ship 0 waits just above One Island.
    const islands = LAYOUTS.oneIsland.islands;
    const ships = createWorld().ships.map((s, i) => (i === 0 ? { ...s, pos: { x: 820, y: 290 } } : s));
    const overIsland = Array.from({ length: 200 }, (_, seed) => placeMovingStorm(ships, seed).value!.pos)
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
    const storm: Hazard = { id: 0, kind: "movingStorm", pos: { x: 100, y: 100 }, heading: 0, phase: "active", timeLeft: 1 };
    expect(inMovingStorm({ x: 100 + M.radius - 1, y: 100 }, storm)).toBe(true);
    expect(inMovingStorm({ x: 100 + M.radius + 1, y: 100 }, storm)).toBe(false);
  });
});
