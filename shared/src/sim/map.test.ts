import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { ISLAND, SPAWN_POINTS, START_POINTS } from "./map.ts";

describe("map", () => {
  it("keeps every start and spawn point inside the sea and clear of the island", () => {
    const r = TUNING.ship.radius;
    for (const p of [...START_POINTS, ...SPAWN_POINTS]) {
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
});
