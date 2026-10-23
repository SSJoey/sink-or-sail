import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { updateEnergy, type EnergyState } from "./energy.ts";

const { max, refillPerSecond, restartThreshold } = TUNING.energy;
const full: EnergyState = { energy: max, locked: false, boosting: false, shielding: false };
const at = (energy: number, extra: Partial<EnergyState> = {}): EnergyState => ({ ...full, energy, ...extra });

describe("updateEnergy", () => {
  it("drains while boosting", () => {
    const { state } = updateEnergy(full, 0, { boost: true, shield: false }, 1);
    expect(state.boosting).toBe(true);
    expect(state.energy).toBeCloseTo(max - TUNING.boost.energyPerSecond);
  });

  it("drains while shielding", () => {
    const { state } = updateEnergy(full, 0, { boost: false, shield: true }, 1);
    expect(state.shielding).toBe(true);
    expect(state.energy).toBeCloseTo(max - TUNING.shield.energyPerSecond);
  });

  it("drains for both when boost and shield are used together", () => {
    const { state } = updateEnergy(full, 0, { boost: true, shield: true }, 0.5);
    expect(state.energy).toBeCloseTo(max - 0.5 * (TUNING.boost.energyPerSecond + TUNING.shield.energyPerSecond));
  });

  it("refills when neither is used, up to the maximum", () => {
    expect(updateEnergy(at(50), 0, { boost: false, shield: false }, 1).state.energy).toBeCloseTo(50 + refillPerSecond);
    expect(updateEnergy(at(max - 1), 0, { boost: false, shield: false }, 1).state.energy).toBe(max);
  });

  it("does not refill while boosting or shielding", () => {
    const { state } = updateEnergy(at(50), 0, { boost: true, shield: false }, 0.1);
    expect(state.energy).toBeLessThan(50);
  });

  it("hits empty: clamps at 0, locks, and reports it once", () => {
    const first = updateEnergy(at(1), 3, { boost: true, shield: false }, 0.5);
    expect(first.state.energy).toBe(0);
    expect(first.state.locked).toBe(true);
    expect(first.events).toContainEqual({ type: "energyEmpty", ship: 3 });

    const next = updateEnergy(first.state, 3, { boost: true, shield: false }, 0.05);
    expect(next.state.boosting).toBe(false);
    expect(next.events).not.toContainEqual({ type: "energyEmpty", ship: 3 });
  });

  it(`refills while locked, and unlocks at the restart threshold (${restartThreshold})`, () => {
    let state = at(0, { locked: true });
    const wants = { boost: true, shield: true };
    const justBelow = (restartThreshold - 0.01) / refillPerSecond;
    const below = updateEnergy(state, 0, wants, justBelow);
    expect(below.state.boosting).toBe(false);
    expect(below.state.shielding).toBe(false);
    expect(below.state.locked).toBe(true);
    expect(below.state.energy).toBeCloseTo(restartThreshold - 0.01);

    state = updateEnergy(below.state, 0, wants, 0.01 / refillPerSecond + 0.001).state;
    const after = updateEnergy(state, 0, wants, 0.05);
    expect(after.state.locked).toBe(false);
    expect(after.state.boosting).toBe(true);
  });

  it("reports energyRestored when the lock lifts", () => {
    const { events } = updateEnergy(at(restartThreshold, { locked: true }), 2, { boost: false, shield: false }, 0.05);
    expect(events).toContainEqual({ type: "energyRestored", ship: 2 });
  });

  it("reports boostStarted and shieldRaised only when they begin", () => {
    const start = updateEnergy(full, 1, { boost: true, shield: true }, 0.05);
    expect(start.events).toEqual([{ type: "boostStarted", ship: 1 }, { type: "shieldRaised", ship: 1 }]);
    const held = updateEnergy(start.state, 1, { boost: true, shield: true }, 0.05);
    expect(held.events).toEqual([]);
  });

  it("stops boosting and shielding when the buttons are released", () => {
    const { state } = updateEnergy(at(50, { boosting: true, shielding: true }), 0, { boost: false, shield: false }, 0.05);
    expect(state.boosting).toBe(false);
    expect(state.shielding).toBe(false);
  });

  it("reports the energy spent on boost and on shield", () => {
    const both = updateEnergy(full, 0, { boost: true, shield: true }, 0.5);
    expect(both.spent.boost).toBeCloseTo(0.5 * TUNING.boost.energyPerSecond);
    expect(both.spent.shield).toBeCloseTo(0.5 * TUNING.shield.energyPerSecond);
    const resting = updateEnergy(at(50), 0, { boost: false, shield: false }, 1);
    expect(resting.spent).toEqual({ boost: 0, shield: 0 });
  });

  it("never reports more spent than the bar held, split by each one's share", () => {
    const { spent } = updateEnergy(at(7), 0, { boost: true, shield: true }, 1);
    expect(spent.boost + spent.shield).toBeCloseTo(7);
    expect(spent.boost / spent.shield).toBeCloseTo(TUNING.boost.energyPerSecond / TUNING.shield.energyPerSecond);
  });
});
