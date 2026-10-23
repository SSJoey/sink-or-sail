import { TUNING } from "../tuning.ts";
import type { Ship } from "./types.ts";

/** A ready-to-sail ship for tests; override any field. */
export function testShip(overrides: Partial<Ship> = {}): Ship {
  return {
    id: 0,
    pos: { x: 300, y: 300 },
    vel: { x: 0, y: 0 },
    heading: 0,
    turret: 0,
    health: TUNING.ship.maxHealth,
    energy: TUNING.energy.max,
    energyLocked: false,
    boosting: false,
    shielding: false,
    fireCooldown: 0,
    protection: 0,
    sunk: false,
    respawnIn: 0,
    sinkings: 0,
    boostEnergy: 0,
    shieldEnergy: 0,
    ...overrides,
  };
}
