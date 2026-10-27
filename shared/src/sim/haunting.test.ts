import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { placeInZone, zoneOf, zoneRect } from "./hazards.ts";
import { LAYOUTS, LAYOUT_IDS } from "./layouts.ts";
import { createWorld } from "./match.ts";
import { step } from "./step.ts";
import type { Hazard, HazardKind, ShipInput, SimEvent, World } from "./types.ts";
import { distance, type Vec } from "./vec.ts";
import { wreckHull } from "./wrecks.ts";

const DT = 0.05;
const HT = TUNING.haunting;
const H = TUNING.hazards;
const ZONES = HT.zonesAcross * HT.zonesDown;
const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const ofType = <E extends SimEvent, T extends SimEvent["type"]>(events: E[], type: T) => events.filter((e): e is E & Extract<SimEvent, { type: T }> => e.type === type);

function run(w: World, seconds: number) {
  const events: (SimEvent & { at: number })[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = step(w, [idle, idle, idle], DT);
    w = r.world;
    events.push(...r.events.map((e) => ({ ...e, at: w.time })));
    if (w.over) break;
  }
  return { world: w, events };
}

/**
 * A 3-ship Last Afloat match with hazards on and the hazard timer far off, in which ship 2 is out and its ghost
 * haunts from `ghosts[0]`. Ships 0 and 1 wait at their starts. A second ghost (ship 1's) is only for the meter's
 * sake: with 3 ships a second crew out would end the match, so ship 1 stays afloat.
 */
function haunted(ghosts: Vec[], setUp: (w: World) => void = () => {}): World {
  const w = createWorld({ mode: "lastAfloat", lives: 1, ships: 3, hazards: true, firstHazardAt: 1000 });
  w.wrecks = [];
  w.ships[2] = { ...w.ships[2]!, sunk: true, out: true, livesLeft: 0 };
  w.ghosts = ghosts.map((pos, i) => ({ ship: 2 - i, pos, heading: 0, appearIn: 0 }));
  setUp(w);
  return w;
}
/** The middle of zone `z`. */
const middle = (z: number) => {
  const r = zoneRect(z);
  return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
};
const storm = (id: number): Hazard => ({ id, kind: "movingStorm", pos: { x: 800, y: 450 }, heading: 0, phase: "active", timeLeft: 100, spin: 0 });

describe("the haunting zones", () => {
  it(`split the sea ${HT.zonesAcross} across and ${HT.zonesDown} down, numbered row by row`, () => {
    expect(zoneOf({ x: 0, y: 0 })).toBe(0);
    expect(zoneOf({ x: 1599, y: 0 })).toBe(HT.zonesAcross - 1);
    expect(zoneOf({ x: 0, y: 899 })).toBe(HT.zonesAcross);
    expect(zoneOf({ x: 1600, y: 900 })).toBe(ZONES - 1);
    expect(zoneRect(5)).toEqual({ x0: 400, y0: 450, x1: 800, y1: 900 });
  });

  it("come only in Last Afloat with hazards on (and not when dynamic hazards are turned off for a test)", () => {
    expect(createWorld({ mode: "lastAfloat", hazards: true }).haunting).toEqual({ meters: Array(ZONES).fill(0), cooldowns: Array(ZONES).fill(0) });
    expect(createWorld({ mode: "lastAfloat" }).haunting).toBeNull();
    expect(createWorld({ hazards: true }).haunting).toBeNull();
    expect(createWorld({ mode: "lastAfloat", hazards: true, firstHazardAt: null }).haunting).toBeNull();
  });
});

describe("a zone's haunting meter", () => {
  it(`fills in ${HT.fillTime} s with one ghost in it, twice as fast with two; other zones stay empty`, () => {
    const one = run(haunted([middle(5)]), HT.fillTime / 2).world;
    expect(one.haunting!.meters[5]).toBeCloseTo(0.5, 2);
    expect(one.haunting!.meters.filter((_, z) => z !== 5)).toEqual(Array(ZONES - 1).fill(0));
    const two = run(haunted([middle(5), middle(5)]), HT.fillTime / 4).world;
    expect(two.haunting!.meters[5]).toBeCloseTo(0.5, 2);
  });

  it(`drains over ${HT.drainTime} s with no ghost in it`, () => {
    const w = haunted([middle(0)], (w) => { w.haunting!.meters[5] = 0.5; });
    expect(run(w, HT.drainTime / 4).world.haunting!.meters[5]).toBeCloseTo(0.25, 2);
    expect(run(w, HT.drainTime).world.haunting!.meters[5]).toBe(0);
  });

  it("isn't filled by a ghost that hasn't appeared yet", () => {
    const w = haunted([middle(5)], (w) => { w.ghosts[0] = { ...w.ghosts[0]!, appearIn: 100 }; });
    expect(run(w, 2).world.haunting!.meters[5]).toBe(0);
  });
});

describe("a full meter", () => {
  const nearlyFull = (zone: number, setUp: (w: World) => void = () => {}) => haunted([middle(zone)], (w) => { w.haunting!.meters[zone] = 1 - DT / HT.fillTime / 2; setUp(w); });

  it("sets off a hazard in its zone (signalled as usual) and says which ghosts did it", () => {
    const { events, world } = run(nearlyFull(5), DT * 2);
    const signalled = ofType(events, "hazardSignalled");
    expect(signalled).toHaveLength(1);
    const r = zoneRect(5);
    expect(signalled[0]!.pos.x).toBeGreaterThanOrEqual(r.x0);
    expect(signalled[0]!.pos.x).toBeLessThanOrEqual(r.x1);
    expect(signalled[0]!.pos.y).toBeGreaterThanOrEqual(r.y0);
    expect(signalled[0]!.pos.y).toBeLessThanOrEqual(r.y1);
    expect(ofType(events, "hauntingTriggered")).toEqual([expect.objectContaining({ zone: 5, hazard: signalled[0]!.hazard, ghosts: [2] })]);
    expect(world.hazards[0]!.phase).toBe("signalled");
  });

  it(`then empties, and the zone can't fill again for ${HT.zoneCap} s`, () => {
    const w = run(nearlyFull(5), DT * 2).world;
    expect(w.haunting!.meters[5]).toBe(0);
    expect(w.haunting!.cooldowns[5]).toBeCloseTo(HT.zoneCap, 0);
    expect(run(w, HT.zoneCap - 1).world.haunting!.meters[5]).toBe(0);
    expect(run(w, HT.zoneCap + 2).world.haunting!.meters[5]).toBeGreaterThan(0);
  });

  it("counts as the next hazard: the regular timer starts its wait again", () => {
    const w = run(nearlyFull(5, (w) => { w.nextHazardIn = 5; }), DT * 2).world;
    expect(w.nextHazardIn).toBeGreaterThanOrEqual(H.minGap - DT * 2);
    expect(w.nextHazardIn).toBeLessThanOrEqual(H.maxGap);
  });

  it("may come while another hazard is on the sea (2 at once), but not a third", () => {
    const second = run(nearlyFull(5, (w) => { w.hazards = [storm(0)]; w.nextHazardId = 1; }), DT * 2);
    expect(ofType(second.events, "hauntingTriggered")).toHaveLength(1);
    expect(second.world.hazards).toHaveLength(2);
    const third = run(nearlyFull(5, (w) => { w.hazards = [storm(0), storm(1)]; w.nextHazardId = 2; }), 1);
    expect(ofType(third.events, "hauntingTriggered")).toEqual([]);
    expect(third.world.haunting!.meters[5]).toBe(1);
  });

  it("the same seed gives the same haunted hazards", () => {
    const kinds = (seed: number) => ofType(run(haunted([middle(5)], (w) => { w.hazardRng = seed; }), HT.fillTime + 1).events, "hazardSignalled");
    expect(kinds(4)).toEqual(kinds(4));
  });
});

describe("where a haunted hazard appears", () => {
  it("inside its zone, its reach in the sea and clear of every ship, its body clear of islands and wrecks — every layout, zone and kind", () => {
    for (const id of LAYOUT_IDS) {
      const solids = [...LAYOUTS[id].islands, ...LAYOUTS[id].wrecks.map(wreckHull)];
      const ships = createWorld({ layout: id, ships: 3 }).ships;
      for (let zone = 0; zone < ZONES; zone++) {
        for (const kind of ["movingStorm", "whirlpool", "kraken"] as HazardKind[]) {
          let placed = 0;
          for (let seed = 0; seed < 10; seed++) {
            const spot = placeInZone(kind, zone, ships, seed, solids).value;
            if (!spot) continue;
            placed++;
            expect(zoneOf(spot.pos), `${id} ${zone} ${kind}`).toBe(zone);
            const reach = { movingStorm: TUNING.movingStorm.radius, whirlpool: TUNING.whirlpool.reach, kraken: TUNING.kraken.grabReach }[kind];
            for (const s of ships) expect(distance(spot.pos, s.pos)).toBeGreaterThanOrEqual(reach + TUNING.ship.radius + H.clearance);
            expect(Math.min(spot.pos.x, spot.pos.y, TUNING.sea.width - spot.pos.x, TUNING.sea.height - spot.pos.y)).toBeGreaterThanOrEqual(reach);
            const body = { movingStorm: 0, whirlpool: TUNING.whirlpool.eyeRadius, kraken: TUNING.kraken.bodyRadius }[kind];
            if (body > 0) for (const solid of solids) expect(circleOverlapsPolygon(spot.pos, body, solid)).toBeNull();
          }
          expect(placed, `${id} zone ${zone} ${kind}`).toBeGreaterThan(5);
        }
      }
    }
  });
});
