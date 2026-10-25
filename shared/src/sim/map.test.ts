import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { ISLAND, SEA_CENTRE, SPAWN_POINTS, START_POINTS, START_POINTS_3 } from "./map.ts";
import { distance } from "./vec.ts";

describe("map", () => {
  it("keeps every start and spawn point inside the sea and clear of the island", () => {
    const r = TUNING.ship.radius;
    for (const p of [...START_POINTS, ...START_POINTS_3, ...SPAWN_POINTS]) {
      expect(p.x).toBeGreaterThanOrEqual(r);
      expect(p.x).toBeLessThanOrEqual(TUNING.sea.width - r);
      expect(p.y).toBeGreaterThanOrEqual(r);
      expect(p.y).toBeLessThanOrEqual(TUNING.sea.height - r);
      expect(circleOverlapsPolygon(p, r * 3, ISLAND)).toBeNull();
    }
  });

  it("has a start point for each of the 2 ships and 4 respawn points", () => {
    expect(START_POINTS).toHaveLength(2);
    expect(SPAWN_POINTS).toHaveLength(4);
  });

  it("has 3-ship starts on an equal-sided triangle centred on the island: Crew 1 bottom left, Crew 2 bottom right, Crew 3 top", () => {
    expect(START_POINTS_3).toHaveLength(3);
    const [a, b, c] = START_POINTS_3 as [typeof SEA_CENTRE, typeof SEA_CENTRE, typeof SEA_CENTRE];
    for (const p of START_POINTS_3) expect(distance(p, SEA_CENTRE)).toBeCloseTo(360);
    expect(distance(a, b)).toBeCloseTo(distance(b, c));
    expect(distance(b, c)).toBeCloseTo(distance(c, a));
    expect(distance(a, b)).toBeGreaterThan(TUNING.gun.shotRange);
    expect(a.x).toBeLessThan(SEA_CENTRE.x);
    expect(b.x).toBeGreaterThan(SEA_CENTRE.x);
    expect(c.y).toBeLessThan(SEA_CENTRE.y);
  });
});
