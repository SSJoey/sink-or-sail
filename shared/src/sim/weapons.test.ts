import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { testShip } from "./testShip.ts";
import type { GunnerInput, Ship, Shot } from "./types.ts";
import { aimTurret, fireGun, moveShot } from "./weapons.ts";

const { fireInterval, shotSpeed, shotRange } = TUNING.gun;
const DT = 0.05;
const gunner = (g: Partial<GunnerInput> = {}): GunnerInput => ({ aim: { x: 0, y: 0 }, fire: false, shield: false, ...g });

describe("aimTurret", () => {
  it("points the turret exactly where the gunner aims, in sea directions", () => {
    expect(aimTurret(testShip({ heading: 1 }), { x: 0, y: -1 }).turret).toBeCloseTo(-Math.PI / 2);
  });

  it("keeps the last aim when the stick is released", () => {
    expect(aimTurret(testShip({ turret: 2 }), { x: 0, y: 0 }).turret).toBe(2);
  });

  it("ignores non-finite aim", () => {
    expect(aimTurret(testShip({ turret: 2 }), { x: NaN, y: 1 }).turret).toBe(2);
  });

  it("is independent of the ship's heading", () => {
    const ship = aimTurret(testShip({ heading: 0 }), { x: -1, y: 0 });
    expect(ship.turret).toBeCloseTo(Math.PI);
    expect(ship.heading).toBe(0);
  });
});

describe("fireGun", () => {
  it("fires a shot from the ship's centre along the turret at shot speed", () => {
    const { ship, shot, events } = fireGun(testShip({ id: 1, turret: Math.PI / 2 }), gunner({ fire: true }), DT, 7);
    expect(shot).toMatchObject({ id: 7, owner: 1, pos: { x: 300, y: 300 }, travelled: 0 });
    expect(shot?.vel.x).toBeCloseTo(0);
    expect(shot?.vel.y).toBeCloseTo(shotSpeed);
    expect(ship.fireCooldown).toBe(fireInterval);
    expect(events).toEqual([{ type: "shotFired", ship: 1, shot: 7 }]);
  });

  it("does not carry the ship's own speed", () => {
    const { shot } = fireGun(testShip({ vel: { x: 150, y: 0 } }), gunner({ fire: true }), DT, 0);
    expect(shot?.vel).toEqual({ x: shotSpeed, y: 0 });
  });

  it(`auto-fires every ${fireInterval} s while held`, () => {
    let ship: Ship = testShip();
    let shots = 0;
    for (let i = 0; i < 40; i++) {
      const result = fireGun(ship, gunner({ fire: true }), DT, i);
      ship = result.ship;
      if (result.shot) shots++;
    }
    expect(shots).toBe(5); // at 0, 0.4, 0.8, 1.2 and 1.6 s within 2 s
  });

  it("counts the cooldown down while not firing", () => {
    const { ship, shot } = fireGun(testShip({ fireCooldown: 0.3 }), gunner(), DT, 0);
    expect(shot).toBeNull();
    expect(ship.fireCooldown).toBeCloseTo(0.25);
  });

  it("does not fire while the shield is up: shield wins", () => {
    const { shot } = fireGun(testShip({ shielding: true }), gunner({ fire: true, shield: true }), DT, 0);
    expect(shot).toBeNull();
  });

  it("ends respawn protection when the ship fires", () => {
    const { ship, events } = fireGun(testShip({ id: 2, protection: 1.5 }), gunner({ fire: true }), DT, 0);
    expect(ship.protection).toBe(0);
    expect(events).toContainEqual({ type: "protectionEnded", ship: 2 });
  });

  it("does not fire from a sunk ship", () => {
    expect(fireGun(testShip({ sunk: true }), gunner({ fire: true }), DT, 0).shot).toBeNull();
  });
});

describe("moveShot", () => {
  const shot: Shot = { id: 1, owner: 0, pos: { x: 0, y: 0 }, vel: { x: shotSpeed, y: 0 }, travelled: 0 };

  it("moves the shot along its velocity and returns the path it swept", () => {
    const moved = moveShot(shot, DT);
    expect(moved.from).toEqual({ x: 0, y: 0 });
    expect(moved.to.x).toBeCloseTo(shotSpeed * DT);
    expect(moved.shot.travelled).toBeCloseTo(shotSpeed * DT);
    expect(moved.expired).toBe(false);
  });

  it(`stops at its range (${shotRange}) and expires`, () => {
    const nearlyDone = { ...shot, pos: { x: shotRange - 5, y: 0 }, travelled: shotRange - 5 };
    const moved = moveShot(nearlyDone, DT);
    expect(moved.to.x).toBeCloseTo(shotRange);
    expect(moved.expired).toBe(true);
  });
});
