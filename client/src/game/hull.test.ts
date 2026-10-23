import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { AIM_CONE_HALF_ANGLE, aimGuide, dashes, hullPoints, turretEnd } from "./hull.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("hullPoints", () => {
  it("puts the pointed bow ahead of the ship, along its heading", () => {
    const pos = { x: 100, y: 100 };
    const [bow] = hullPoints(pos, Math.PI / 2);
    expect(bow!.x).toBeCloseTo(100);
    expect(bow!.y).toBeGreaterThan(120);
  });

  it("stays inside the ship's collision circle", () => {
    const pos = { x: 0, y: 0 };
    for (const p of hullPoints(pos, 1.234)) expect(dist(p, pos)).toBeLessThanOrEqual(TUNING.ship.radius + 0.001);
  });

  it("is longer than it is wide, so the heading is easy to read", () => {
    const pts = hullPoints({ x: 0, y: 0 }, 0);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1.8 * (Math.max(...ys) - Math.min(...ys)));
  });
});

describe("turretEnd", () => {
  it("points along the turret angle", () => {
    const end = turretEnd({ x: 10, y: 10 }, Math.PI);
    expect(end.x).toBeLessThan(10);
    expect(end.y).toBeCloseTo(10);
  });
});

describe("aimGuide", () => {
  it("runs from the ship to shot range, with the crosshair at the end", () => {
    const guide = aimGuide({ x: 100, y: 100 }, 0);
    expect(guide.end).toEqual({ x: 100 + TUNING.gun.shotRange, y: 100 });
    expect(guide.crosshair).toEqual(guide.end);
  });

  it("has a 10°-wide cone either side of the aim", () => {
    expect(AIM_CONE_HALF_ANGLE).toBeCloseTo((5 * Math.PI) / 180);
    const guide = aimGuide({ x: 0, y: 0 }, 0);
    expect(Math.atan2(guide.coneLeft.y, guide.coneLeft.x)).toBeCloseTo(-AIM_CONE_HALF_ANGLE);
    expect(Math.atan2(guide.coneRight.y, guide.coneRight.x)).toBeCloseTo(AIM_CONE_HALF_ANGLE);
  });
});

describe("dashes", () => {
  it("splits a line into dashes with gaps", () => {
    const segs = dashes({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 10);
    expect(segs).toHaveLength(5);
    expect(segs[0]).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(segs[4]).toEqual([{ x: 80, y: 0 }, { x: 90, y: 0 }]);
  });

  it("cuts the last dash short at the end of the line", () => {
    const segs = dashes({ x: 0, y: 0 }, { x: 25, y: 0 }, 10, 10);
    expect(segs.at(-1)).toEqual([{ x: 20, y: 0 }, { x: 25, y: 0 }]);
  });
});
