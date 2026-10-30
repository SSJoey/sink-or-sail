import { describe, expect, it } from "vitest";
import { minimapDots, minimapFit, toMinimap } from "./minimap.ts";
import type { HazardView, ShipView } from "./interpolation.ts";

describe("the minimap (Stage 5 slice 3)", () => {
  it("fits the whole sea in the box, centred", () => {
    const fit = minimapFit({ width: 1600, height: 900 }, { width: 150, height: 96 });
    expect(fit.scale).toBeCloseTo(150 / 1600);
    expect(fit.x).toBe(0);
    expect(fit.y).toBeCloseTo((96 - 900 * (150 / 1600)) / 2);
    expect(toMinimap({ x: 0, y: 0 }, fit)).toEqual({ x: 0, y: fit.y });
    const corner = toMinimap({ x: 1600, y: 900 }, fit);
    expect(corner.x).toBeCloseTo(150);
    expect(corner.y).toBeCloseTo(96 - fit.y);
  });

  it("a bigger sea of the same shape fills the box the same way", () => {
    const fit = minimapFit({ width: 3200, height: 1800 }, { width: 150, height: 96 });
    expect(toMinimap({ x: 1600, y: 900 }, fit)).toEqual({ x: 75, y: 48 });
  });

  it("shows every ship afloat as a dot, except another crew's hidden in a moving storm", () => {
    const ship = (x: number, extra: Partial<ShipView> = {}) => ({ x, y: 100, sunk: false, out: false, ...extra }) as ShipView;
    const cloud = { kind: "movingStorm", phase: "active", x: 500, y: 100 } as HazardView;
    const ships = [ship(500), ship(510), ship(900, { sunk: true }), ship(1200)];
    expect(minimapDots(ships, new Map([["h1", cloud]]), 0)).toEqual([
      { crew: 0, x: 500, y: 100, own: true },
      { crew: 3, x: 1200, y: 100, own: false },
    ]);
    expect(minimapDots(ships, new Map(), null).map((d) => d.crew)).toEqual([0, 1, 3]);
  });
});
