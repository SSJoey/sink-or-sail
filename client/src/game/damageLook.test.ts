import { describe, expect, it } from "vitest";
import { TUNING, pointInPolygon } from "@sink-or-sail/shared";
import { flameSpots, hullCracks, isDamaged, smokePuffs } from "./damageLook.ts";
import { hullPoints } from "./hull.ts";

const FULL = TUNING.ship.maxHealth;
const D = TUNING.client.damage;

describe("visible damage (Stage 4 slice 6)", () => {
  it("shows below a quarter of full health, not at it, and not on a sunk ship", () => {
    expect(isDamaged({ health: FULL * 0.24, sunk: false })).toBe(true);
    expect(isDamaged({ health: FULL * 0.25, sunk: false })).toBe(false);
    expect(isDamaged({ health: FULL, sunk: false })).toBe(false);
    expect(isDamaged({ health: 0, sunk: true })).toBe(false);
  });

  it("puts the cracks and flames on the deck, turning with the ship", () => {
    for (const heading of [0, 1, 2.5, -2]) {
      const pos = { x: 500, y: 300 };
      const hull = hullPoints(pos, heading);
      for (const line of hullCracks(pos, heading)) for (const p of line) expect(pointInPolygon(p, hull)).toBe(true);
      const flames = flameSpots(pos, heading);
      expect(flames).toHaveLength(2);
      for (const p of flames) expect(pointInPolygon(p, hull)).toBe(true);
    }
    expect(flameSpots({ x: 0, y: 0 }, 0)).not.toEqual(flameSpots({ x: 0, y: 0 }, 1));
  });

  it("smoke comes in a steady stream of puffs that drift back from the stern, grow and fade", () => {
    const ship = { x: 500, y: 300, heading: 0 };
    for (const now of [0, 1234, 98765]) {
      const puffs = smokePuffs(ship, now);
      expect(puffs).toHaveLength(D.smokePuffs);
      for (const p of puffs) {
        expect(p.x).toBeLessThan(ship.x);
        expect(p.alpha).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeLessThanOrEqual(D.smokeAlpha);
      }
      // Older puffs are further back, bigger and fainter.
      const byAge = [...puffs].sort((a, b) => a.age - b.age);
      for (let i = 1; i < byAge.length; i++) {
        expect(byAge[i]!.x).toBeLessThan(byAge[i - 1]!.x);
        expect(byAge[i]!.radius).toBeGreaterThan(byAge[i - 1]!.radius);
        expect(byAge[i]!.alpha).toBeLessThan(byAge[i - 1]!.alpha);
      }
    }
  });

  it("drifts the other way for a ship heading the other way", () => {
    const puffs = smokePuffs({ x: 500, y: 300, heading: Math.PI }, 500);
    for (const p of puffs) expect(p.x).toBeGreaterThan(500);
  });
});
