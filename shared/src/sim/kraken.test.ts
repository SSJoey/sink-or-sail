import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, pointInPolygon } from "./geometry.ts";
import { placeHazard } from "./hazards.ts";
import { LAYOUTS, LAYOUT_IDS } from "./layouts.ts";
import { createWorld, type WorldOptions } from "./match.ts";
import { step } from "./step.ts";
import type { Hazard, ShipInput, SimEvent, World } from "./types.ts";
import { distance, type Vec } from "./vec.ts";
import { wreckHull } from "./wrecks.ts";

const DT = 0.05;
const H = TUNING.hazards;
const K = TUNING.kraken;
const FULL = TUNING.ship.maxHealth;
const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const ofType = <E extends SimEvent, T extends SimEvent["type"]>(events: E[], type: T) => events.filter((e): e is E & Extract<SimEvent, { type: T }> => e.type === type);

/** Runs for `seconds` with the given inputs, keeping each event with the match time it happened at. */
function run(w: World, seconds: number, inputs: (w: World) => ShipInput[] = () => [idle, idle]) {
  const events: (SimEvent & { at: number })[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = step(w, inputs(w), DT);
    w = r.world;
    events.push(...r.events.map((e) => ({ ...e, at: w.time })));
    if (w.over) break;
  }
  return { world: w, events };
}

/** A world with no hazard timer and no wrecks, holding one hand-placed kraken; ships 0 and 1 at the given spots. */
function withKraken(kraken: Partial<Hazard>, ship0: Vec, ship1: Vec, options: WorldOptions = {}, setUp: (w: World) => void = () => {}): World {
  const w = createWorld({ hazards: true, ...options });
  w.nextHazardIn = null;
  w.wrecks = [];
  w.hazards = [{ id: 0, kind: "kraken", pos: { x: 800, y: 150 }, heading: 0, phase: "active", timeLeft: K.lifetime, spin: 0, health: K.health, holding: null, holdLeft: 0, ...kraken }];
  w.nextHazardId = 1;
  w.ships[0] = { ...w.ships[0]!, pos: ship0, vel: { x: 0, y: 0 } };
  w.ships[1] = { ...w.ships[1]!, pos: ship1, vel: { x: 0, y: 0 } };
  setUp(w);
  return w;
}
const kraken = (w: World) => w.hazards[0]!;
const steer = (x: number, y: number, boost = false): ShipInput => ({ pilot: { steer: { x, y }, boost }, gunner: idle.gunner });
const fireAt = (from: Vec, at: Vec): ShipInput => ({ pilot: idle.pilot, gunner: { aim: { x: at.x - from.x, y: at.y - from.y }, fire: true, shield: false } });

describe("which hazard comes, with the kraken", () => {
  it("picks storms, whirlpools and krakens with the seed, about equally often", () => {
    const firsts = Array.from({ length: 150 }, (_, seed) => ofType(step(createWorld({ hazards: true, seed, firstHazardAt: DT }), [idle, idle], DT).events, "hazardSignalled")[0]!.kind);
    for (const kind of ["movingStorm", "whirlpool", "kraken"]) {
      const n = firsts.filter((k) => k === kind).length;
      expect(n, kind).toBeGreaterThan(30);
      expect(n, kind).toBeLessThan(70);
    }
  });
});

describe("where a kraken surfaces", () => {
  it(`${K.distanceFromShip} from a ship, its reach ${H.clearance} clear of every ship, inside the sea, its body clear of islands and wrecks — every layout, many seeds`, () => {
    for (const id of LAYOUT_IDS) {
      const solids = [...LAYOUTS[id].islands, ...LAYOUTS[id].wrecks.map(wreckHull)];
      for (const three of [false, true]) {
        const ships = createWorld({ layout: id, ships: three ? 3 : 2 }).ships;
        let placed = 0;
        for (let seed = 0; seed < 50; seed++) {
          const spot = placeHazard("kraken", ships, seed, solids).value;
          if (!spot) continue;
          placed++;
          expect(distance(spot.pos, ships[spot.ship]!.pos)).toBeCloseTo(K.distanceFromShip);
          for (const s of ships) expect(distance(spot.pos, s.pos)).toBeGreaterThanOrEqual(K.grabReach + TUNING.ship.radius + H.clearance);
          expect(Math.min(spot.pos.x, spot.pos.y, TUNING.sea.width - spot.pos.x, TUNING.sea.height - spot.pos.y)).toBeGreaterThanOrEqual(K.grabReach);
          for (const solid of solids) expect(circleOverlapsPolygon(spot.pos, K.bodyRadius, solid), `${id} ${seed}`).toBeNull();
        }
        expect(placed, `${id} ${three}`).toBeGreaterThan(40);
      }
    }
  });

  it("surfaces with full health, holding nothing", () => {
    const surfaced = Array.from({ length: 20 }, (_, seed) => step(createWorld({ hazards: true, firstHazardAt: DT, seed }), [idle, idle], DT).world)
      .find((w) => w.hazards[0]?.kind === "kraken")!;
    expect(kraken(surfaced)).toMatchObject({ phase: "signalled", health: K.health, holding: null });
  });
});

describe("a kraken hunting", () => {
  it(`swims at ${K.speed} toward the nearest ship afloat`, () => {
    const { world } = run(withKraken({ pos: { x: 600, y: 450 } }, { x: 300, y: 450 }, { x: 1450, y: 450 }), 1);
    expect(kraken(world).pos.x).toBeCloseTo(600 - K.speed, 0);
    expect(kraken(world).pos.y).toBeCloseTo(450, 5);
  });

  it("switches to whichever ship is nearest as they move", () => {
    const w = withKraken({ pos: { x: 800, y: 150 } }, { x: 500, y: 150 }, { x: 1150, y: 150 });
    const first = run(w, 0.5).world;
    expect(kraken(first).pos.x).toBeLessThan(800);
    first.ships[1] = { ...first.ships[1]!, pos: { x: kraken(first).pos.x + 150, y: 150 } };
    const before = kraken(first).pos.x;
    expect(kraken(run(first, 0.5).world).pos.x).toBeGreaterThan(before);
  });

  it("never hunts a protected ship", () => {
    const w = withKraken({ pos: { x: 600, y: 450 } }, { x: 400, y: 450 }, { x: 1450, y: 450 }, {}, (w) => { w.ships[0] = { ...w.ships[0]!, protection: 2 }; });
    expect(kraken(run(w, 1).world).pos.x).toBeGreaterThan(600);
  });

  it("swims under islands", () => {
    // One Island: from above the island to a ship below it, straight through.
    const island = LAYOUTS.oneIsland.islands[0]!;
    let crossed = false;
    run(withKraken({ pos: { x: 800, y: 250 }, timeLeft: 100 }, { x: 800, y: 700 }, { x: 1450, y: 150 }), 5, (w) => {
      if (pointInPolygon(kraken(w).pos, island)) crossed = true;
      return [idle, idle];
    });
    expect(crossed).toBe(true);
  });

  it(`gives up and dives after ${K.lifetime} s without a grab (reason time), then fades`, () => {
    const w = withKraken({ pos: { x: 800, y: 150 } }, { x: 150, y: 800 }, { x: 1450, y: 800 }, {}, (w) => { w.ships = w.ships.map((s) => ({ ...s, protection: 100 })); });
    const { world, events } = run(w, K.lifetime + 0.5);
    expect(ofType(events, "hazardEnded")).toEqual([expect.objectContaining({ kind: "kraken", reason: "time" })]);
    expect(ofType(events, "krakenGrab")).toEqual([]);
    expect(kraken(world).phase).toBe("fading");
  });
});

describe("a kraken's grab", () => {
  /** Ship 0 just inside the grab reach, east of the kraken, facing east. */
  const near = () => withKraken({ pos: { x: 800, y: 150 } }, { x: 800 + K.grabReach - 1, y: 150 }, { x: 1450, y: 800 }, {}, (w) => { w.ships[0] = { ...w.ships[0]!, heading: 0 }; });

  it(`grabs the ship it hunts once that ship's centre is within ${K.grabReach}`, () => {
    const { world, events } = run(near(), DT);
    expect(ofType(events, "krakenGrab")).toEqual([expect.objectContaining({ ship: 0, hazard: 0 })]);
    expect(kraken(world)).toMatchObject({ holding: 0 });
  });

  it("holds the ship still: the pilot can't steer or boost; the gunner can still fire", () => {
    const w = run(near(), DT).world;
    const at = w.ships[0]!.pos;
    const { world, events } = run(w, 2, () => [{ ...steer(1, 0, true), gunner: { aim: { x: 0, y: 1 }, fire: true, shield: false } }, idle]);
    expect(distance(world.ships[0]!.pos, at)).toBeLessThan(0.5);
    expect(world.ships[0]!.boosting).toBe(false);
    expect(ofType(events, "boostStarted")).toEqual([]);
    expect(ofType(events, "shotFired").length).toBeGreaterThan(0);
  });

  it(`hurts it ${K.damage * 100}% of full health each second for ${K.holdTime} s (a shield doesn't help), then lets go and dives (reason grab)`, () => {
    const w = run(near(), DT).world;
    const shield: ShipInput = { ...idle, gunner: { ...idle.gunner, shield: true } };
    const { world, events } = run(w, K.holdTime + 0.2, () => [shield, idle]);
    const damage = ofType(events, "krakenDamage");
    expect(damage.map((e) => [e.ship, e.damage])).toEqual([[0, FULL * K.damage], [0, FULL * K.damage], [0, FULL * K.damage]]);
    expect(damage.map((e) => e.at - DT)).toEqual([1, 2, 3].map((s) => expect.closeTo(s, 1)));
    expect(world.ships[0]!.health).toBeCloseTo(FULL * (1 - K.holdTime * K.damage));
    expect(ofType(events, "krakenReleased")).toEqual([expect.objectContaining({ ship: 0, hazard: 0, reason: "time" })]);
    expect(ofType(events, "hazardEnded")).toEqual([expect.objectContaining({ kind: "kraken", reason: "grab" })]);
    expect(kraken(world)).toMatchObject({ phase: "fading", holding: null });
  });

  it("grabs only once: after letting go the ship sails off and nothing grabs it again", () => {
    const w = run(near(), DT).world;
    const { world, events } = run(w, K.holdTime + 2, () => [steer(1, 0), idle]);
    expect(ofType(events, "krakenGrab")).toEqual([]);
    expect(world.ships[0]!.pos.x).toBeGreaterThan(800 + K.grabReach + 20);
  });

  it("a ship sunk while held: cause kraken, nobody credited; the kraken lets go (reason sunk) and dives", () => {
    const w = withKraken({ pos: { x: 800, y: 150 } }, { x: 800 + K.grabReach - 1, y: 150 }, { x: 1450, y: 800 }, { mode: "lastAfloat", lives: 2 }, (w) => {
      w.ships[0] = { ...w.ships[0]!, health: 5 };
    });
    const { events, world } = run(w, 1.3);
    expect(events).toContainEqual(expect.objectContaining({ type: "sunk", ship: 0, by: null, cause: "kraken", livesLeft: 1 }));
    expect(ofType(events, "krakenReleased")).toEqual([expect.objectContaining({ ship: 0, reason: "sunk" })]);
    expect(ofType(events, "hazardEnded")).toEqual([expect.objectContaining({ reason: "grab" })]);
    expect(world.ships.map((s) => s.sinkings)).toEqual([0, 0]);
  });
});

describe("shooting a kraken", () => {
  it(`shots from any crew hurt it (${TUNING.gun.shotDamage} each); at 0 it lets go of the ship it holds (reason shot) and dives`, () => {
    // Ship 0 is held; ship 1 shoots the kraken from the east.
    const w = withKraken({ pos: { x: 800, y: 150 }, holding: 0, holdLeft: K.holdTime }, { x: 740, y: 150 }, { x: 1100, y: 150 });
    const { world, events } = run(w, 2, (w) => [idle, w.hazards[0]?.phase === "active" ? fireAt(w.ships[1]!.pos, { x: 800, y: 150 }) : idle]);
    const hits = ofType(events, "krakenHit");
    expect(hits.slice(0, 3).map((e) => [e.by, e.weapon, e.damage])).toEqual([[1, "shot", 20], [1, "shot", 20], [1, "shot", 20]]);
    expect(ofType(events, "krakenReleased")).toEqual([expect.objectContaining({ ship: 0, reason: "shot" })]);
    expect(ofType(events, "hazardEnded")).toEqual([expect.objectContaining({ kind: "kraken", reason: "shot" })]);
    expect(kraken(world).phase).toBe("fading");
    expect(world.ships[1]!.sinkings).toBe(0);
  });

  it("the held ship's own gunner can shoot it too", () => {
    const w = withKraken({ pos: { x: 800, y: 150 }, holding: 0, holdLeft: K.holdTime }, { x: 740, y: 150 }, { x: 1450, y: 800 });
    const { events } = run(w, 0.5, (w) => [fireAt(w.ships[0]!.pos, { x: 800, y: 150 }), idle]);
    expect(ofType(events, "krakenHit")[0]).toMatchObject({ by: 0, weapon: "shot" });
  });

  it("a torpedo hurts it 50 and stops there", () => {
    const w = withKraken({ pos: { x: 800, y: 150 }, timeLeft: 100 }, { x: 1450, y: 800 }, { x: 1100, y: 150 }, { packs: true }, (w) => {
      w.ships[1] = { ...w.ships[1]!, heading: Math.PI, gunnerPack: "torpedo" };
      w.nextSignalIn = 100;
    });
    const fire: ShipInput = { ...idle, gunner: { ...idle.gunner, pack: true } };
    const { events, world } = run(w, 1.5, (w) => [idle, w.time < DT * 1.5 ? fire : idle]);
    expect(ofType(events, "krakenHit")).toEqual([expect.objectContaining({ by: 1, weapon: "torpedo", damage: 50 })]);
    expect(world.torpedoes).toEqual([]);
    expect(kraken(world).health).toBe(K.health - 50);
  });

  it("can't be hit while only signalled or fading", () => {
    for (const phase of ["signalled", "fading"] as const) {
      const w = withKraken({ pos: { x: 800, y: 150 }, phase, timeLeft: 5 }, { x: 150, y: 800 }, { x: 1100, y: 150 });
      expect(ofType(run(w, 1, (w) => [idle, fireAt(w.ships[1]!.pos, { x: 800, y: 150 })]).events, "krakenHit")).toEqual([]);
    }
  });
});
