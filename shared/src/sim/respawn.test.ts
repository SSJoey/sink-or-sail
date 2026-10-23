import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { SEA_CENTRE, SPAWN_POINTS } from "./map.ts";
import { chooseSpawn, respawnShip } from "./respawn.ts";
import { testShip } from "./testShip.ts";
import { angleOf, sub } from "./vec.ts";

describe("chooseSpawn", () => {
  it("picks the spawn point farthest from the enemies", () => {
    const enemyTopLeft = { x: 150, y: 150 };
    expect(chooseSpawn(SPAWN_POINTS, [enemyTopLeft])).toEqual(SPAWN_POINTS[3]);
  });

  it("maximises the distance to the nearest enemy when there are several", () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
    expect(chooseSpawn(points, [{ x: 0, y: 0 }, { x: 210, y: 0 }])).toEqual({ x: 100, y: 0 });
  });

  it("uses the first point when there are no enemies afloat", () => {
    expect(chooseSpawn(SPAWN_POINTS, [])).toEqual(SPAWN_POINTS[0]);
  });
});

describe("respawnShip", () => {
  it("brings the ship back whole, with protection, facing the middle of the sea", () => {
    const sunk = testShip({ sunk: true, health: 0, energy: 3, energyLocked: true, fireCooldown: 0.2, vel: { x: 9, y: 9 }, sinkings: 2, boostEnergy: 40, shieldEnergy: 12 });
    const at = SPAWN_POINTS[0]!;
    const ship = respawnShip(sunk, at);
    expect(ship).toMatchObject({
      sunk: false,
      respawnIn: 0,
      pos: at,
      vel: { x: 0, y: 0 },
      health: TUNING.ship.maxHealth,
      energy: TUNING.energy.max,
      energyLocked: false,
      fireCooldown: 0,
      protection: TUNING.respawn.protection,
      sinkings: 2,
      boostEnergy: 40,
      shieldEnergy: 12,
    });
    expect(ship.heading).toBeCloseTo(angleOf(sub(SEA_CENTRE, at)));
    expect(ship.turret).toBeCloseTo(ship.heading);
  });
});
