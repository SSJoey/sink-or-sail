import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { zoneCount, zoneOf, zoneRect } from "./hazards.ts";
import { SPAWN_POINTS } from "./map.ts";
import { createWorld } from "./match.ts";
import { DEFAULT_SEA, seaCentre } from "./sea.ts";
import { seaSpots, spreadLayout } from "./seaLayout.ts";
import { keepInSea } from "./ship.ts";
import { DEFAULT_STORM_TIMES, inStorm, stormRadius } from "./storm.ts";
import { sinkForTest, step } from "./step.ts";
import type { ShipInput } from "./types.ts";
import { angleOf, distance, sub } from "./vec.ts";

// Stage 5 slice 5: matches on the bigger seas.
const DT = 0.05;
const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const MID = { width: 3200, height: 1800 };
const LARGE = { width: 4000, height: 2250 };

describe("a match's sea (Stage 5)", () => {
  it("2–3 ships keep today's sea, starts, pack spots and corner respawn spots", () => {
    for (const ships of [2, 3] as const) {
      const world = createWorld({ ships, layout: "twinIsles" });
      expect(world.sea).toEqual(DEFAULT_SEA);
      expect(world.respawns).toBe(SPAWN_POINTS);
    }
  });

  it("5 ships sail a 3200 × 1800 sea: the layout spread out, starts round the ring facing the middle", () => {
    const world = createWorld({ ships: 5, layout: "crossroads", hazards: true });
    expect(world.sea).toEqual(MID);
    const spots = seaSpots("crossroads", MID, 5);
    expect(world.ships.map((s) => s.pos)).toEqual(spots.starts);
    expect(world.packSpots).toEqual(spots.packSpots);
    expect(world.respawns).toEqual(spots.respawns);
    expect(world.islands).toBe(spreadLayout("crossroads", MID).islands);
    expect(world.reefs).toBe(spreadLayout("crossroads", MID).reefs);
    expect(world.wrecks.map((w) => w.pos)).toEqual(spreadLayout("crossroads", MID).wrecks.map((w) => w.pos));
    for (const ship of world.ships) expect(ship.heading).toBeCloseTo(angleOf(sub(seaCentre(MID), ship.pos)));
  });

  it("10 ships sail a 4000 × 2250 sea", () => {
    const world = createWorld({ ships: 10 });
    expect(world.sea).toEqual(LARGE);
    expect(world.ships).toHaveLength(10);
  });

  it("a test server can ask for a bigger sea with fewer ships", () => {
    const world = createWorld({ ships: 2, sea: MID });
    expect(world.sea).toEqual(MID);
    expect(world.ships.map((s) => s.pos)).toEqual(seaSpots("oneIsland", MID, 2).starts);
  });

  it("ships stop at the bigger sea's edge", () => {
    const world = createWorld({ ships: 5 });
    const ship = { ...world.ships[0]!, pos: { x: 3195, y: 900 }, vel: { x: 100, y: 0 } };
    expect(keepInSea(ship, world.sea).pos.x).toBe(3200 - TUNING.ship.radius);
    expect(keepInSea(ship).pos.x).toBe(1600 - TUNING.ship.radius);
  });

  it("the closing storm's circles grow with the sea, round its middle", () => {
    expect(stormRadius(DEFAULT_STORM_TIMES, 0, MID)).toBeCloseTo(TUNING.closingStorm.startRadius * 2);
    expect(stormRadius(DEFAULT_STORM_TIMES, 1000, MID)).toBeCloseTo(600);
    expect(stormRadius(DEFAULT_STORM_TIMES, 1000, LARGE)).toBeCloseTo(750);
    expect(stormRadius(DEFAULT_STORM_TIMES, 1000)).toBeCloseTo(300);
    expect(inStorm({ x: 1600, y: 900 }, 600, MID)).toBe(false);
    expect(inStorm({ x: 800, y: 450 }, 600, MID)).toBe(true);
  });

  it("haunting zones keep today's size, so a bigger sea has more", () => {
    expect(zoneCount()).toBe(8);
    expect(zoneCount(MID)).toBe(32);
    expect(zoneCount(LARGE)).toBe(50);
    expect(zoneOf({ x: 3199, y: 1799 }, MID)).toBe(31);
    expect(zoneRect(31, MID)).toEqual({ x0: 2800, y0: 1350, x1: 3200, y1: 1800 });
    const world = createWorld({ ships: 6, mode: "lastAfloat", hazards: true });
    expect(world.haunting!.meters).toHaveLength(32);
  });

  it("a sunk ship comes back at the respawn spot farthest from every enemy", () => {
    let world = createWorld({ ships: 5 });
    world = sinkForTest(world, 0).world;
    const inputs = world.ships.map(() => idle);
    while (world.ships[0]!.sunk) world = step(world, inputs, DT).world;
    const enemies = world.ships.slice(1).map((s) => s.pos);
    const nearest = (p: { x: number; y: number }) => Math.min(...enemies.map((e) => distance(p, e)));
    const best = Math.max(...world.respawns.map(nearest));
    expect(world.respawns).toContainEqual(world.ships[0]!.pos);
    expect(nearest(world.ships[0]!.pos)).toBeCloseTo(best);
  });

  it("more ships, more packs on the map at once: 3 with 6 ships", () => {
    let world = createWorld({ ships: 6, packs: true });
    const inputs = world.ships.map(() => idle);
    let most = 0;
    for (let t = 0; t < 40; t += DT) {
      world = step(world, inputs, DT).world;
      most = Math.max(most, world.packs.length);
    }
    expect(most).toBe(3);
  });
});
