import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { PACK_SPOTS, PACK_SPOTS_3, SEA_CENTRE, START_POINTS, START_POINTS_3 } from "./map.ts";
import { angleOf, sub } from "./vec.ts";
import { createWorld, matchResult, timeLeft } from "./match.ts";

describe("createWorld", () => {
  it("puts two ships at their start points, whole, facing each other, with no score", () => {
    const world = createWorld();
    expect(world.time).toBe(0);
    expect(world.over).toBe(false);
    expect(world.shots).toEqual([]);
    expect(world.ships).toHaveLength(2);
    const [a, b] = world.ships;
    expect(a).toMatchObject({ id: 0, pos: START_POINTS[0], health: TUNING.ship.maxHealth, energy: TUNING.energy.max, sinkings: 0, sunk: false, boostEnergy: 0, shieldEnergy: 0 });
    expect(b).toMatchObject({ id: 1, pos: START_POINTS[1] });
    expect(a!.heading).toBeCloseTo(0);
    expect(Math.abs(b!.heading)).toBeCloseTo(Math.PI);
  });
});

describe("createWorld with 3 ships", () => {
  it("has 2 ships and today's pack spots by default", () => {
    const world = createWorld();
    expect(world.ships).toHaveLength(2);
    expect(world.packSpots).toBe(PACK_SPOTS);
    expect(createWorld({ ships: 2 }).ships.map((s) => s.pos)).toEqual(START_POINTS);
  });

  it("puts 3 ships at the triangle starts, facing the middle, with the 3-ship pack spots", () => {
    const world = createWorld({ ships: 3 });
    expect(world.ships.map((s) => s.id)).toEqual([0, 1, 2]);
    expect(world.ships.map((s) => s.pos)).toEqual(START_POINTS_3);
    for (const s of world.ships) expect(s.heading).toBeCloseTo(angleOf(sub(SEA_CENTRE, s.pos)));
    expect(world.packSpots).toBe(PACK_SPOTS_3);
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

  it("with 3 ships: the single leader wins; a tie between leaders is a draw", () => {
    const world = createWorld({ ships: 3 });
    world.ships[2]!.sinkings = 2;
    world.ships[0]!.sinkings = 1;
    expect(matchResult(world)).toEqual({ winner: 2, sinkings: [1, 0, 2] });
    world.ships[1]!.sinkings = 2;
    expect(matchResult(world).winner).toBeNull();
  });

  it("is a draw when sinkings are equal", () => {
    const world = createWorld();
    world.ships[0]!.sinkings = 2;
    world.ships[1]!.sinkings = 2;
    expect(matchResult(world)).toEqual({ winner: null, sinkings: [2, 2] });
  });
});
