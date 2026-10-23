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
): { state: EnergyState; events: SimEvent[]; spent: { boost: number; shield: number } } {
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

  const boostCost = boosting ? TUNING.boost.energyPerSecond : 0;
  const shieldCost = shielding ? TUNING.shield.energyPerSecond : 0;
  const cost = boostCost + shieldCost;
  const before = energy;
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

  // What was actually used (never more than the bar held), split by each one's share of the cost.
  const used = cost > 0 ? before - energy : 0;
  const spent = { boost: cost > 0 ? (used * boostCost) / cost : 0, shield: cost > 0 ? (used * shieldCost) / cost : 0 };

  return { state: { energy, locked, boosting, shielding }, events, spent };
}
