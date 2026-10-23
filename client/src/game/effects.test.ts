import { describe, expect, it } from "vitest";
import { ShipEffects } from "./effects.ts";

const FLASH = 150;
const FADE = 1000;
const make = () => new ShipEffects(FLASH, FADE);
const ship = (hits: number, sunk = false) => ({ hits, sunk });

describe("ShipEffects", () => {
  it("does not flash or fade for what was already true when first seen; an already-sunk ship is hidden", () => {
    const fx = make();
    expect(fx.update(0, ship(5, false), 0)).toEqual({ flashing: false, sinkAlpha: null, justSank: false });
    expect(fx.update(1, ship(5, true), 0)).toEqual({ flashing: false, sinkAlpha: 0, justSank: false });
  });

  it(`flashes for ${FLASH} ms when the hit count goes up`, () => {
    const fx = make();
    fx.update(0, ship(0), 0);
    expect(fx.update(0, ship(1), 100).flashing).toBe(true);
    expect(fx.update(0, ship(1), 200).flashing).toBe(true);
    expect(fx.update(0, ship(1), 260).flashing).toBe(false);
  });

  it(`reports a sinking once and fades the ship out over ${FADE} ms`, () => {
    const fx = make();
    fx.update(1, ship(0), 0);
    const sank = fx.update(1, ship(1, true), 1000);
    expect(sank.justSank).toBe(true);
    expect(sank.sinkAlpha).toBeCloseTo(1);
    const half = fx.update(1, ship(1, true), 1500);
    expect(half.justSank).toBe(false);
    expect(half.sinkAlpha).toBeCloseTo(0.5);
    expect(fx.update(1, ship(1, true), 2100).sinkAlpha).toBe(0);
  });

  it("clears the fade when the ship comes back", () => {
    const fx = make();
    fx.update(0, ship(0), 0);
    fx.update(0, ship(0, true), 100);
    expect(fx.update(0, ship(0, false), 3200).sinkAlpha).toBeNull();
  });

  it("tracks each ship separately and can be reset for a new match", () => {
    const fx = make();
    fx.update(0, ship(0), 0);
    fx.update(1, ship(0), 0);
    expect(fx.update(1, ship(1), 50).flashing).toBe(true);
    expect(fx.update(0, ship(0), 50).flashing).toBe(false);
    fx.reset();
    expect(fx.update(1, ship(9), 60).flashing).toBe(false);
  });
});
