import { describe, expect, it } from "vitest";
import { add, angleOf, clampLength, dot, fromAngle, length, normalise, scale, sub, turnToward, wrapAngle } from "./vec.ts";

describe("vectors", () => {
  it("adds, subtracts, scales and dots", () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    expect(sub({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: -2, y: -2 });
    expect(scale({ x: 1, y: -2 }, 3)).toEqual({ x: 3, y: -6 });
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    expect(length({ x: 3, y: 4 })).toBe(5);
  });

  it("normalises, leaving the zero vector alone", () => {
    expect(normalise({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(normalise({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("clamps length", () => {
    const clamped = clampLength({ x: 3, y: 4 }, 1);
    expect(clamped.x).toBeCloseTo(0.6);
    expect(clamped.y).toBeCloseTo(0.8);
    expect(clampLength({ x: 0.3, y: 0.4 }, 1)).toEqual({ x: 0.3, y: 0.4 });
  });

  it("uses 0 = east and positive = clockwise on screen (y points down)", () => {
    expect(angleOf({ x: 1, y: 0 })).toBe(0);
    expect(angleOf({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
    const south = fromAngle(Math.PI / 2);
    expect(south.x).toBeCloseTo(0);
    expect(south.y).toBeCloseTo(1);
  });
});

describe("angles", () => {
  it("wraps into (-π, π]", () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });

  it("turns toward a target by at most the given step, the short way round", () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(0, -1, 0.25)).toBeCloseTo(-0.25);
    expect(turnToward(0, 0.1, 0.25)).toBeCloseTo(0.1);
    // From just below +π to just above -π is a short clockwise turn across the wrap.
    expect(turnToward(3.0, -3.0, 0.1)).toBeCloseTo(3.1);
  });
});
