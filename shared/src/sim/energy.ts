import { TUNING } from "../tuning.ts";
import type { SimEvent } from "./types.ts";

export interface EnergyState {
  energy: number;
  locked: boolean;
  boosting: boolean;
  shielding: boolean;
}

export interface EnergyWants {
  boost: boolean;
  shield: boolean;
}

/** One time step of the shared bar: decides whether boost and shield are on, then drains or refills. */
export function updateEnergy(
  prev: EnergyState,
  shipId: number,
  wants: EnergyWants,
  dt: number,
): { state: EnergyState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  let { energy, locked } = prev;

  if (locked && energy >= TUNING.energy.restartThreshold) {
    locked = false;
    events.push({ type: "energyRestored", ship: shipId });
  }

  const usable = !locked && energy > 0;
  const boosting = wants.boost && usable;
  const shielding = wants.shield && usable;
  if (boosting && !prev.boosting) events.push({ type: "boostStarted", ship: shipId });
  if (shielding && !prev.shielding) events.push({ type: "shieldRaised", ship: shipId });

  const cost = (boosting ? TUNING.boost.energyPerSecond : 0) + (shielding ? TUNING.shield.energyPerSecond : 0);
  if (cost > 0) {
    energy -= cost * dt;
    if (energy <= 0) {
      energy = 0;
      locked = true;
      events.push({ type: "energyEmpty", ship: shipId });
    }
  } else {
    energy = Math.min(TUNING.energy.max, energy + TUNING.energy.refillPerSecond * dt);
  }

  return { state: { energy, locked, boosting, shielding }, events };
}
