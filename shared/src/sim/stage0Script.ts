import type { ShipInput, World } from "./types.ts";

/**
 * A fixed 90-second two-ship fight (steering, boost, bumps, shots, shields, sinkings, respawns) used to
 * check that the simulation with packs off still plays exactly as Stage 0 did. Inputs depend only on
 * the world, so the script is deterministic.
 */
export const STAGE0_SCRIPT_SECONDS = 90;
export const STAGE0_SCRIPT_DT = 0.05;

export function stage0ScriptInputs(world: World): ShipInput[] {
  const t = world.time;
  return world.ships.map((ship, i) => {
    const enemy = world.ships[1 - i]!;
    // Pilots head for open water above the island, weaving; gunners aim at the enemy.
    const goal = { x: 800 + (i === 0 ? -120 : 120) + 150 * Math.sin(t * 0.8 + i), y: 200 + 80 * Math.cos(t * 0.6 + i) };
    return {
      pilot: { steer: { x: goal.x - ship.pos.x, y: goal.y - ship.pos.y }, boost: (t + i * 3) % 8 < 1.5 },
      gunner: { aim: { x: enemy.pos.x - ship.pos.x, y: enemy.pos.y - ship.pos.y }, fire: (t + i) % 5 < 4, shield: (t + i * 2) % 9 > 7.8 },
    };
  });
}
