import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { ISLAND } from "./map.ts";
import { keepInSea, pushOutOfIsland, separateShips, steerShip } from "./ship.ts";
import { testShip } from "./testShip.ts";
import type { Ship } from "./types.ts";
import { angleOf, length } from "./vec.ts";

const { maxSpeed, turnRate, radius } = TUNING.ship;
const DT = 0.05;

/** Runs steerShip for `seconds` with the same input. */
function sail(ship: Ship, steer: { x: number; y: number }, seconds: number, boosting = false): Ship {
  let s = ship;
  for (let t = 0; t < seconds - 1e-9; t += DT) s = steerShip(s, { steer, boost: boosting }, boosting, DT);
  return s;
}

describe("steerShip", () => {
  it("speeds up toward top speed when the stick is pushed fully", () => {
    const ship = sail(testShip(), { x: 1, y: 0 }, 5);
    expect(length(ship.vel)).toBeCloseTo(maxSpeed, 0);
    expect(ship.pos.x).toBeGreaterThan(300);
  });

  it("sets speed by how far the stick is pushed", () => {
    const ship = sail(testShip(), { x: 0.5, y: 0 }, 5);
    expect(length(ship.vel)).toBeCloseTo(maxSpeed / 2, 0);
  });

  it("clamps a stick vector longer than 1", () => {
    const ship = sail(testShip(), { x: 5, y: 0 }, 5);
    expect(length(ship.vel)).toBeCloseTo(maxSpeed, 0);
  });

  it("ignores a stick with non-finite values", () => {
    const ship = steerShip(testShip(), { steer: { x: NaN, y: Infinity }, boost: false }, false, DT);
    expect(ship.vel).toEqual({ x: 0, y: 0 });
    expect(ship.heading).toBe(0);
  });

  it("turns toward the stick direction at most at the turn rate", () => {
    const ship = steerShip(testShip(), { steer: { x: 0, y: 1 }, boost: false }, false, DT);
    expect(ship.heading).toBeCloseTo(turnRate * DT);
  });

  it("ends up pointing where the stick points", () => {
    const ship = sail(testShip(), { x: 0, y: 1 }, 1);
    expect(ship.heading).toBeCloseTo(Math.PI / 2);
  });

  it("drifts: right after a turn, the ship still slides partly the old way", () => {
    const cruising = sail(testShip(), { x: 1, y: 0 }, 3);
    const turned = sail(cruising, { x: 0, y: 1 }, 0.5);
    expect(turned.heading).toBeCloseTo(Math.PI / 2);
    expect(angleOf(turned.vel)).toBeLessThan(Math.PI / 2 - 0.1);
    const settled = sail(turned, { x: 0, y: 1 }, 3);
    expect(angleOf(settled.vel)).toBeCloseTo(Math.PI / 2, 2);
  });

  it("slows to a stop when the stick is released, keeping its heading", () => {
    const cruising = sail(testShip(), { x: 0, y: 1 }, 3);
    const coasting = sail(cruising, { x: 0, y: 0 }, 4);
    expect(length(coasting.vel)).toBeLessThan(1);
    expect(coasting.heading).toBeCloseTo(Math.PI / 2);
  });

  it(`boost drives the ship ahead at ×${TUNING.boost.speedMultiplier} top speed, even with the stick released`, () => {
    const ship = sail(testShip({ heading: Math.PI }), { x: 0, y: 0 }, 5, true);
    expect(length(ship.vel)).toBeCloseTo(maxSpeed * TUNING.boost.speedMultiplier, 0);
    expect(ship.vel.x).toBeLessThan(0);
  });

  it("boost still lets the pilot steer", () => {
    const ship = sail(testShip(), { x: 0, y: 0.1 }, 2, true);
    expect(ship.heading).toBeCloseTo(Math.PI / 2);
    expect(length(ship.vel)).toBeGreaterThan(maxSpeed);
  });
});

describe("keepInSea", () => {
  it("stops a ship at the sea edge and keeps its sliding motion", () => {
    const ship = keepInSea(testShip({ pos: { x: 5, y: 300 }, vel: { x: -100, y: 40 } }));
    expect(ship.pos.x).toBe(radius);
    expect(ship.vel).toEqual({ x: 0, y: 40 });
  });

  it("handles every edge", () => {
    const { width, height } = TUNING.sea;
    const ship = keepInSea(testShip({ pos: { x: width + 50, y: height + 50 }, vel: { x: 10, y: 10 } }));
    expect(ship.pos).toEqual({ x: width - radius, y: height - radius });
    expect(ship.vel).toEqual({ x: 0, y: 0 });
  });

  it("leaves a ship inside the sea alone", () => {
    const ship = testShip({ vel: { x: 10, y: 10 } });
    expect(keepInSea(ship)).toEqual(ship);
  });
});

describe("pushOutOfIsland", () => {
  it("moves a ship that overlaps the island back to its edge, and removes motion into it", () => {
    // Island's left vertex is at (660, 420); approach from the west.
    const ship = pushOutOfIsland(testShip({ pos: { x: 650, y: 420 }, vel: { x: 100, y: 0 } }), ISLAND);
    expect(circleOverlapsPolygon(ship.pos, radius - 0.001, ISLAND)).toBeNull();
    expect(ship.vel.x).toBeLessThanOrEqual(0.001);
  });

  it("keeps motion along the island's edge so the ship slides", () => {
    const ship = pushOutOfIsland(testShip({ pos: { x: 790, y: 330 }, vel: { x: 50, y: 50 } }), ISLAND);
    expect(Math.abs(ship.vel.x)).toBeGreaterThan(20);
  });

  it("leaves a ship that is clear of the island alone", () => {
    const ship = testShip();
    expect(pushOutOfIsland(ship, ISLAND)).toEqual(ship);
  });

  it("never lets a ship sail into the island", () => {
    let ship = testShip({ pos: { x: 500, y: 450 } });
    for (let i = 0; i < 200; i++) {
      ship = pushOutOfIsland(steerShip(ship, { steer: { x: 1, y: 0.05 }, boost: true }, true, DT), ISLAND);
      expect(circleOverlapsPolygon(ship.pos, radius - 0.5, ISLAND)).toBeNull();
    }
  });
});

describe("separateShips", () => {
  it("does nothing for ships that are apart", () => {
    const a = testShip({ id: 0, pos: { x: 100, y: 100 } });
    const b = testShip({ id: 1, pos: { x: 300, y: 100 } });
    expect(separateShips(a, b)).toEqual({ a, b, touching: false, closingSpeed: 0 });
  });

  it("pushes overlapping ships apart equally until they just touch", () => {
    const a = testShip({ id: 0, pos: { x: 100, y: 100 } });
    const b = testShip({ id: 1, pos: { x: 140, y: 100 } });
    const result = separateShips(a, b);
    expect(result.touching).toBe(true);
    expect(result.a.pos.x).toBeCloseTo(100 - (2 * radius - 40) / 2);
    expect(result.b.pos.x - result.a.pos.x).toBeCloseTo(2 * radius);
  });

  it("measures closing speed and removes it from both ships", () => {
    const a = testShip({ id: 0, pos: { x: 100, y: 100 }, vel: { x: 100, y: 20 } });
    const b = testShip({ id: 1, pos: { x: 150, y: 100 }, vel: { x: -50, y: 0 } });
    const result = separateShips(a, b);
    expect(result.closingSpeed).toBeCloseTo(150);
    expect(result.a.vel.x).toBeCloseTo(result.b.vel.x);
    expect(result.a.vel.y).toBeCloseTo(20);
  });

  it("reports zero closing speed for ships moving apart while touching", () => {
    const a = testShip({ id: 0, pos: { x: 100, y: 100 }, vel: { x: -30, y: 0 } });
    const b = testShip({ id: 1, pos: { x: 150, y: 100 }, vel: { x: 30, y: 0 } });
    const result = separateShips(a, b);
    expect(result.closingSpeed).toBe(0);
    expect(result.a.vel.x).toBe(-30);
  });

  it("counts ships within a hair of each other as still touching", () => {
    const a = testShip({ id: 0, pos: { x: 100, y: 100 } });
    const b = testShip({ id: 1, pos: { x: 100 + 2 * radius + 0.5, y: 100 } });
    expect(separateShips(a, b).touching).toBe(true);
  });
});
