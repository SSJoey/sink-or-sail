import { describe, expect, it } from "vitest";
import { inStickZone, knobPosition, stickVector } from "./stick.ts";

const R = 60;
const DZ = 0.1;
const origin = { x: 100, y: 100 };
const at = (dx: number, dy: number) => ({ x: origin.x + dx, y: origin.y + dy });

describe("stickVector", () => {
  it("is zero inside the dead zone", () => {
    expect(stickVector(origin, at(0, 0), R, DZ)).toEqual({ x: 0, y: 0 });
    expect(stickVector(origin, at(5, 3), R, DZ)).toEqual({ x: 0, y: 0 });
    expect(stickVector(origin, at(6, 0), R, DZ)).toEqual({ x: 0, y: 0 });
  });

  it("rises smoothly from 0 at the dead-zone edge to 1 at full travel", () => {
    expect(stickVector(origin, at(6 + 27, 0), R, DZ).x).toBeCloseTo(0.5);
    expect(stickVector(origin, at(60, 0), R, DZ).x).toBeCloseTo(1);
    expect(stickVector(origin, at(6.5, 0), R, DZ).x).toBeLessThan(0.02);
  });

  it("clamps to length 1 beyond full travel", () => {
    const v = stickVector(origin, at(0, -500), R, DZ);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(-1);
  });

  it("points the way the thumb moved (screen y down)", () => {
    const v = stickVector(origin, at(30, 30), R, DZ);
    expect(v.x).toBeCloseTo(v.y);
    expect(v.x).toBeGreaterThan(0);
  });
});

describe("knobPosition", () => {
  it("follows the thumb but stays within the stick's travel", () => {
    expect(knobPosition(origin, at(20, 0), R)).toEqual(at(20, 0));
    const far = knobPosition(origin, at(300, 400), R);
    expect(far.x).toBeCloseTo(origin.x + 36);
    expect(far.y).toBeCloseTo(origin.y + 48);
  });
});

describe("inStickZone", () => {
  it("is the left half of the screen", () => {
    expect(inStickZone(10, 800)).toBe(true);
    expect(inStickZone(399, 800)).toBe(true);
    expect(inStickZone(400, 800)).toBe(false);
    expect(inStickZone(700, 800)).toBe(false);
  });
});
