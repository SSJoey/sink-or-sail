import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { TUNING as T, pointInPolygon } from "@sink-or-sail/shared";
import { AIM_CONE_HALF_ANGLE, aimGuide, dashes, deckLines, hullPoints, shotTrail, turretEnd } from "./hull.ts";

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

describe("Stage 4 slice 4: the sea-chart hull", () => {
  it("is the mock-up's rounded hull: smooth (many points), mirror-symmetric, bow at the front", () => {
    const pts = hullPoints({ x: 0, y: 0 }, 0);
    expect(pts.length).toBeGreaterThan(20);
    expect(pts[0]).toEqual({ x: 28, y: 0 });
    for (const p of pts) expect(pts.some((q) => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y + p.y) < 1e-9)).toBe(true);
    expect(Math.max(...pts.map((p) => p.x))).toBe(28);
  });

  it("keeps its deck planks inside the hull", () => {
    const pos = { x: 300, y: 200 };
    const hull = hullPoints(pos, 0.7);
    const lines = deckLines(pos, 0.7);
    expect(lines).toHaveLength(3);
    for (const line of lines) for (const p of line) expect(pointInPolygon(p, hull)).toBe(true);
  });
});

describe("shotTrail", () => {
  it("puts two smaller, fainter dots behind the shot, along the way it flies", () => {
    const trail = shotTrail({ x: 100, y: 100, angle: 0 });
    expect(trail).toHaveLength(2);
    expect(trail[0]!.pos.x).toBeLessThan(100);
    expect(trail[1]!.pos.x).toBeLessThan(trail[0]!.pos.x);
    for (const t of trail) expect(t.pos.y).toBeCloseTo(100);
    expect(trail[1]!.radius).toBeLessThan(trail[0]!.radius);
    expect(trail[1]!.alpha).toBeLessThan(trail[0]!.alpha);
    expect(trail[0]!.radius).toBeLessThan(T.client.shotRadius);
  });
});
