import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { START_POINTS } from "./map.ts";
import { createWorld, matchResult, timeLeft } from "./match.ts";

describe("createWorld", () => {
  it("puts two ships at their start points, whole, facing each other, with no score", () => {
    const world = createWorld();
    expect(world.time).toBe(0);
    expect(world.over).toBe(false);
    expect(world.shots).toEqual([]);
    expect(world.ships).toHaveLength(2);
    const [a, b] = world.ships;
    expect(a).toMatchObject({ id: 0, pos: START_POINTS[0], health: TUNING.ship.maxHealth, energy: TUNING.energy.max, sinkings: 0, sunk: false });
    expect(b).toMatchObject({ id: 1, pos: START_POINTS[1] });
    expect(a!.heading).toBeCloseTo(0);
    expect(Math.abs(b!.heading)).toBeCloseTo(Math.PI);
  });
});

describe("timeLeft", () => {
  it(`counts down from ${TUNING.match.duration} s and never below zero`, () => {
    expect(timeLeft({ ...createWorld(), time: 0 })).toBe(TUNING.match.duration);
    expect(timeLeft({ ...createWorld(), time: 100 })).toBe(TUNING.match.duration - 100);
    expect(timeLeft({ ...createWorld(), time: 999 })).toBe(0);
  });
});

describe("matchResult", () => {
  it("names the ship with the most sinkings", () => {
    const world = createWorld();
    world.ships[1]!.sinkings = 3;
    world.ships[0]!.sinkings = 1;
    expect(matchResult(world)).toEqual({ winner: 1, sinkings: [1, 3] });
  });

  it("is a draw when sinkings are equal", () => {
    const world = createWorld();
    world.ships[0]!.sinkings = 2;
    world.ships[1]!.sinkings = 2;
    expect(matchResult(world)).toEqual({ winner: null, sinkings: [2, 2] });
  });
});
