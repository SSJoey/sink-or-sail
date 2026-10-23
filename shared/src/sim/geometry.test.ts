import { describe, expect, it } from "vitest";
import { circleOverlapsPolygon, closestPointOnSegment, pointInPolygon, segmentCircleHit, segmentPolygonHit } from "./geometry.ts";

const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
// An L shape, to make sure concave polygons work.
const ell = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }];

describe("pointInPolygon", () => {
  it("tells inside from outside, including concave shapes", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
    expect(pointInPolygon({ x: 20, y: 80 }, ell)).toBe(true);
    expect(pointInPolygon({ x: 80, y: 80 }, ell)).toBe(false);
  });
});

describe("closestPointOnSegment", () => {
  it("projects onto the segment and clamps to its ends", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(closestPointOnSegment({ x: 5, y: 3 }, a, b)).toEqual({ x: 5, y: 0 });
    expect(closestPointOnSegment({ x: -5, y: 3 }, a, b)).toEqual({ x: 0, y: 0 });
    expect(closestPointOnSegment({ x: 15, y: 3 }, a, b)).toEqual({ x: 10, y: 0 });
  });
});

describe("circleOverlapsPolygon", () => {
  it("returns nothing when the circle is clear", () => {
    expect(circleOverlapsPolygon({ x: 150, y: 50 }, 20, square)).toBeNull();
  });

  it("returns how far and which way to push a circle touching an edge", () => {
    const push = circleOverlapsPolygon({ x: 110, y: 50 }, 20, square);
    expect(push?.normal.x).toBeCloseTo(1);
    expect(push?.normal.y).toBeCloseTo(0);
    expect(push?.depth).toBeCloseTo(10);
  });

  it("pushes a circle whose centre is inside out through the nearest edge", () => {
    const push = circleOverlapsPolygon({ x: 95, y: 50 }, 20, square);
    expect(push?.normal.x).toBeCloseTo(1);
    expect(push?.depth).toBeCloseTo(25);
  });

  it("pushes away from a corner diagonally", () => {
    const push = circleOverlapsPolygon({ x: 110, y: 110 }, 20, square);
    expect(push?.normal.x).toBeCloseTo(Math.SQRT1_2);
    expect(push?.normal.y).toBeCloseTo(Math.SQRT1_2);
  });
});

describe("segmentPolygonHit", () => {
  it("finds where a segment first enters the polygon, as a fraction of its length", () => {
    expect(segmentPolygonHit({ x: -100, y: 50 }, { x: 50, y: 50 }, square)).toBeCloseTo(100 / 150);
  });

  it("returns null for a segment that misses", () => {
    expect(segmentPolygonHit({ x: -100, y: 150 }, { x: 200, y: 150 }, square)).toBeNull();
  });

  it("catches a fast segment that passes right through", () => {
    expect(segmentPolygonHit({ x: -50, y: 50 }, { x: 150, y: 50 }, square)).toBeCloseTo(0.25);
  });

  it("returns 0 for a segment starting inside", () => {
    expect(segmentPolygonHit({ x: 50, y: 50 }, { x: 60, y: 50 }, square)).toBe(0);
  });
});

describe("segmentCircleHit", () => {
  it("finds where a segment first touches a circle", () => {
    expect(segmentCircleHit({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 60, y: 0 }, 10)).toBeCloseTo(0.5);
  });

  it("returns null when the segment misses or stops short", () => {
    expect(segmentCircleHit({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 60, y: 30 }, 10)).toBeNull();
    expect(segmentCircleHit({ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 60, y: 0 }, 10)).toBeNull();
  });

  it("catches a segment that passes right through", () => {
    expect(segmentCircleHit({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 5 }, 10)).not.toBeNull();
  });

  it("returns 0 when the segment starts inside the circle", () => {
    expect(segmentCircleHit({ x: 58, y: 0 }, { x: 100, y: 0 }, { x: 60, y: 0 }, 10)).toBe(0);
  });
});
