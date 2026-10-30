import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { LIFEBAR_TICKS, lifebarColour, lifebarFill, lifebarShown } from "./lifebar.ts";
import type { HazardView } from "./interpolation.ts";

const FULL = TUNING.ship.maxHealth;

describe("the lifebar (Stage 3)", () => {
  it("fills with the ship's health, never below empty or above full", () => {
    expect(lifebarFill(FULL)).toBe(1);
    expect(lifebarFill(FULL * 0.37)).toBeCloseTo(0.37);
    expect(lifebarFill(-5)).toBe(0);
    expect(lifebarFill(FULL * 2)).toBe(1);
  });

  it("is green above half health, amber from a quarter to half, red below a quarter", () => {
    expect([1, 0.51, 0.5, 0.25, 0.249, 0].map(lifebarColour)).toEqual(["green", "green", "amber", "amber", "red", "red"]);
  });

  it("shows for ships afloat, but not for one hidden in a moving storm from another crew", () => {
    const storm = new Map<string, HazardView>([["0", { kind: "movingStorm", phase: "active", x: 400, y: 300, heading: 0, timeLeft: 5, spin: 0, health: 0, holding: -1 }]]);
    const none = new Map<string, HazardView>();
    expect(lifebarShown({ x: 100, y: 100, sunk: false }, 1, 0, none)).toBe(true);
    expect(lifebarShown({ x: 100, y: 100, sunk: true }, 1, 0, none)).toBe(false);
    expect(lifebarShown({ x: 400, y: 300, sunk: false }, 1, 0, storm)).toBe(false);
    expect(lifebarShown({ x: 400, y: 300, sunk: false }, 0, 0, storm)).toBe(true);
    expect(lifebarShown({ x: 400, y: 300, sunk: false }, 1, null, storm)).toBe(false);
  });
});

describe("the styled lifebar (Stage 4 slice 6)", () => {
  it("has ticks where the colour changes: a quarter and a half", () => {
    expect(LIFEBAR_TICKS).toEqual([0.25, 0.5]);
  });
});

describe("Stage 5: the lifebar goes by the ship's own full health", () => {
  it("fills by health over that type's full health", () => {
    expect(lifebarFill(70, 140)).toBe(0.5);
    expect(lifebarFill(75, 75)).toBe(1);
    expect(lifebarFill(50)).toBe(0.5);
  });
});
