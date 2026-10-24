import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { createWorld } from "./match.ts";
import { step } from "./step.ts";
import type { ShipInput, SimEvent, World } from "./types.ts";

const DT = 0.05;
const E = TUNING.emp;
const REACH = TUNING.ship.radius + E.radius;

const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const gunnerPack: ShipInput = { ...idle, gunner: { ...idle.gunner, pack: true } };
const pilotPack: ShipInput = { ...idle, pilot: { ...idle.pilot, pack: true } };

/** Packs on, nothing spawning; ship 0 at (400, 300) holding an EMP; ship 1 at `enemyAt` (default: in range). */
function world(enemyAt = { x: 400 + REACH - 10, y: 300 }, changes: (w: World) => void = () => {}): World {
  const w = createWorld({ packs: true, seed: 1 });
  w.nextSignalIn = null;
  w.ships[0] = { ...w.ships[0]!, pos: { x: 400, y: 300 }, heading: 0, held: "emp" };
  w.ships[1] = { ...w.ships[1]!, pos: enemyAt, heading: Math.PI, turret: Math.PI };
  changes(w);
  return w;
}

function run(w: World, seconds: number, inputs: (w: World) => (ShipInput | undefined)[] = () => []) {
  const events: SimEvent[] = [];
  let cur = w;
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
    const r = step(cur, inputs(cur), DT);
    cur = r.world;
    events.push(...r.events);
  }
  return { world: cur, events };
}

/** Ship 0's gunner fires the EMP on the first step; ship 1 gets `enemy` input every step. */
const empThen = (enemy: ShipInput) => (w: World) => [w.time < DT / 2 ? gunnerPack : idle, enemy];

describe("firing an EMP", () => {
  it("the gunner fires it; enemies in range are caught for 3 s; the slot empties", () => {
    const { world: after, events } = run(world(), DT, empThen(idle));
    expect(after.ships[0]!.held).toBeNull();
    expect(after.ships[1]!.disabled).toBeCloseTo(E.duration);
    expect(events).toContainEqual({ type: "packUsed", ship: 0, packType: "emp", role: "gunner" });
    expect(events).toContainEqual({ type: "empFired", ship: 0, caught: [1] });
  });

  it(`catches only ships within range (circles overlapping radius ${E.radius})`, () => {
    expect(run(world({ x: 400 + REACH - 1, y: 300 }), DT, empThen(idle)).world.ships[1]!.disabled).toBeGreaterThan(0);
    const far = run(world({ x: 400 + REACH + 1, y: 300 }), DT, empThen(idle));
    expect(far.world.ships[1]!.disabled).toBe(0);
    expect(far.events).toContainEqual({ type: "empFired", ship: 0, caught: [] });
  });

  it("never affects the firing ship", () => {
    const { world: after } = run(world(), DT, empThen(idle));
    expect(after.ships[0]!.disabled).toBe(0);
  });

  it("only the gunner can fire it: the pilot's Pack button does nothing", () => {
    const { world: after } = run(world(), 0.5, () => [pilotPack, idle]);
    expect(after.ships[0]!.held).toBe("emp");
    expect(after.ships[1]!.disabled).toBe(0);
  });

  it("doesn't catch a ship with respawn protection, or a sunk ship", () => {
    expect(run(world(undefined, (w) => { w.ships[1] = { ...w.ships[1]!, protection: 1.5 }; }), DT, empThen(idle)).world.ships[1]!.disabled).toBe(0);
    expect(run(world(undefined, (w) => { w.ships[1] = { ...w.ships[1]!, sunk: true, respawnIn: 2 }; }), DT, empThen(idle)).events)
      .toContainEqual({ type: "empFired", ship: 0, caught: [] });
  });

  it("ends the firing ship's own respawn protection", () => {
    const { world: after } = run(world(undefined, (w) => { w.ships[0] = { ...w.ships[0]!, protection: 1.5 }; }), DT, empThen(idle));
    expect(after.ships[0]!.protection).toBe(0);
  });

  it("leaves shots, torpedoes and mines in the water alone", () => {
    const w = world(undefined, (w) => {
      w.mines = [{ id: 0, owner: 1, pos: { x: 450, y: 450 }, age: 0 }];
      w.torpedoes = [{ id: 0, owner: 1, pos: { x: 500, y: 600 }, vel: { x: 0, y: -300 } }];
      w.shots = [{ id: 0, owner: 1, pos: { x: 300, y: 600 }, vel: { x: 0, y: 450 }, travelled: 0 }];
    });
    const { world: after } = run(w, DT, empThen(idle));
    expect(after.mines).toHaveLength(1);
    expect(after.torpedoes).toHaveLength(1);
    expect(after.shots).toHaveLength(1);
  });
});

describe("a caught ship", () => {
  const fire: ShipInput = { ...idle, gunner: { aim: { x: -1, y: 0 }, fire: true, shield: false } };
  const boostAndSteer: ShipInput = { ...idle, pilot: { steer: { x: 0, y: 1 }, boost: true } };
  const shield: ShipInput = { ...idle, gunner: { ...idle.gunner, shield: true } };

  it("can't fire", () => {
    const { events } = run(world(), 2, empThen(fire));
    expect(events.filter((e) => e.type === "shotFired" && e.ship === 1)).toEqual([]);
  });

  it("can't boost, but can still steer", () => {
    const { world: after } = run(world(), 2, empThen(boostAndSteer));
    expect(after.ships[1]!.boosting).toBe(false);
    expect(after.ships[1]!.boostEnergy).toBe(0);
    expect(after.ships[1]!.pos.y).toBeGreaterThan(300 + 20);
    expect(after.ships[1]!.heading).toBeCloseTo(Math.PI / 2, 1);
  });

  it("can't raise a shield, and a raised shield drops at once", () => {
    const shielded = world(undefined, (w) => { w.ships[1] = { ...w.ships[1]!, shielding: true }; });
    const { world: after } = run(shielded, DT, empThen(shield));
    expect(after.ships[1]!.shielding).toBe(false);
    const later = run(after, 1, () => [idle, shield]);
    expect(later.world.ships[1]!.shielding).toBe(false);
  });

  it("can't use packs (the pack stays in the slot)", () => {
    const w = world(undefined, (w) => { w.ships[1] = { ...w.ships[1]!, held: "torpedo" }; });
    const { world: after } = run(w, 1, empThen({ ...idle, gunner: { ...idle.gunner, pack: true } }));
    expect(after.torpedoes).toEqual([]);
    expect(after.ships[1]!.held).toBe("torpedo");
  });

  it(`gets everything back after ${E.duration} s`, () => {
    const caught = run(world(), DT, empThen(idle)).world;
    const nearlyOver = run(caught, E.duration - DT, () => [idle, fire]);
    expect(nearlyOver.events.filter((e) => e.type === "shotFired" && e.ship === 1)).toEqual([]);
    const after = run(nearlyOver.world, 0.1, () => [idle, fire]);
    expect(after.world.ships[1]!.disabled).toBe(0);
    expect(after.events.filter((e) => e.type === "shotFired" && e.ship === 1).length).toBeGreaterThan(0);
  });

  it("is disabled for 3 s from the latest EMP when caught again (no stacking)", () => {
    const caught = run(world(), 2, empThen(idle)).world;
    expect(caught.ships[1]!.disabled).toBeCloseTo(E.duration - 2 + DT);
    const again = { ...caught, ships: [{ ...caught.ships[0]!, held: "emp" as const }, caught.ships[1]!] };
    const { world: after } = run(again, DT, () => [gunnerPack, idle]);
    expect(after.ships[1]!.disabled).toBeCloseTo(E.duration);
  });

  it("refills energy as normal, since boost and shield are off", () => {
    const w = world(undefined, (w) => { w.ships[1] = { ...w.ships[1]!, energy: 50 }; });
    const { world: after } = run(w, 1, empThen(boostAndSteer));
    expect(after.ships[1]!.energy).toBeGreaterThan(50);
  });

  it("is no longer disabled after respawning", () => {
    const sunkWhileDisabled = world(undefined, (w) => {
      w.ships[1] = { ...w.ships[1]!, sunk: true, respawnIn: DT / 2, disabled: 2 };
      w.ships[0] = { ...w.ships[0]!, held: null };
    });
    expect(run(sunkWhileDisabled, DT).world.ships[1]!.disabled).toBe(0);
  });
});

describe("packs off", () => {
  it("never fires an EMP", () => {
    const w = createWorld();
    w.ships[0] = { ...w.ships[0]!, held: "emp" };
    expect(run(w, 0.2, () => [gunnerPack]).world.ships[1]!.disabled).toBe(0);
  });
});
