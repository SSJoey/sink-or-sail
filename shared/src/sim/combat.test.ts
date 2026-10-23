import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { bumpDamage, canBeDamaged, damageShip, traceShot } from "./combat.ts";
import { ISLAND } from "./map.ts";
import { testShip } from "./testShip.ts";

const { minSpeed, fullDamageSpeed, maxDamage } = TUNING.bump;

describe("bumpDamage", () => {
  it(`is zero below ${minSpeed} closing speed`, () => {
    expect(bumpDamage(0)).toBe(0);
    expect(bumpDamage(minSpeed)).toBe(0);
  });

  it("scales with closing speed up to the maximum", () => {
    expect(bumpDamage((minSpeed + fullDamageSpeed) / 2)).toBeCloseTo(maxDamage / 2);
    expect(bumpDamage(fullDamageSpeed)).toBeCloseTo(maxDamage);
    expect(bumpDamage(fullDamageSpeed * 3)).toBe(maxDamage);
  });
});

describe("canBeDamaged", () => {
  it("is false while shielded, protected or sunk", () => {
    expect(canBeDamaged(testShip())).toBe(true);
    expect(canBeDamaged(testShip({ shielding: true }))).toBe(false);
    expect(canBeDamaged(testShip({ protection: 0.1 }))).toBe(false);
    expect(canBeDamaged(testShip({ sunk: true }))).toBe(false);
  });
});

describe("damageShip", () => {
  it("lowers health", () => {
    const { ship, sank } = damageShip(testShip(), 20);
    expect(ship.health).toBe(TUNING.ship.maxHealth - 20);
    expect(sank).toBe(false);
  });

  it(`sinks the ship at zero health and starts the ${TUNING.respawn.delay} s respawn countdown`, () => {
    const { ship, sank } = damageShip(testShip({ health: 20, vel: { x: 50, y: 0 }, boosting: true, shielding: true }), 20);
    expect(sank).toBe(true);
    expect(ship).toMatchObject({ sunk: true, health: 0, respawnIn: TUNING.respawn.delay, vel: { x: 0, y: 0 }, boosting: false, shielding: false });
  });

  it("does not take health below zero", () => {
    expect(damageShip(testShip({ health: 5 }), 20).ship.health).toBe(0);
  });
});

describe("traceShot", () => {
  const shooter = testShip({ id: 0, pos: { x: 100, y: 100 } });

  it("finds the first ship on the shot's path", () => {
    const near = testShip({ id: 1, pos: { x: 200, y: 100 } });
    const far = testShip({ id: 2, pos: { x: 300, y: 100 } });
    expect(traceShot(0, { x: 100, y: 100 }, { x: 400, y: 100 }, [shooter, far, near], ISLAND)).toEqual({ kind: "ship", target: 1 });
  });

  it("never hits the ship that fired it", () => {
    expect(traceShot(0, { x: 100, y: 100 }, { x: 120, y: 100 }, [shooter], ISLAND)).toEqual({ kind: "none" });
  });

  it("passes through sunk ships", () => {
    const sunk = testShip({ id: 1, pos: { x: 200, y: 100 }, sunk: true });
    expect(traceShot(0, { x: 100, y: 100 }, { x: 300, y: 100 }, [shooter, sunk], ISLAND)).toEqual({ kind: "none" });
  });

  it("is stopped by the island before reaching a ship behind it", () => {
    const behind = testShip({ id: 1, pos: { x: 1000, y: 450 } });
    expect(traceShot(0, { x: 600, y: 450 }, { x: 1100, y: 450 }, [shooter, behind], ISLAND)).toEqual({ kind: "island" });
  });

  it("hits a ship in front of the island", () => {
    const before = testShip({ id: 1, pos: { x: 620, y: 450 } });
    expect(traceShot(0, { x: 560, y: 450 }, { x: 700, y: 450 }, [shooter, before], ISLAND)).toEqual({ kind: "ship", target: 1 });
  });
});
