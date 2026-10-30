import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { traceShot } from "./combat.ts";
import { updateEnergy } from "./energy.ts";
import { createWorld } from "./match.ts";
import { dropSpot } from "./mines.ts";
import { respawnShip } from "./respawn.ts";
import { keepInSea, separateShips, steerShip } from "./ship.ts";
import { SHIP_TYPES, SHIP_TYPE_NAMES, isShipType, statsOf, type ShipType } from "./shipTypes.ts";
import { step } from "./step.ts";
import { testShip } from "./testShip.ts";
import { launchTorpedo } from "./torpedoes.ts";
import { NO_INPUT, type Ship, type ShipInput } from "./types.ts";
import { aimTurret, fireGun, moveShot } from "./weapons.ts";
import { distance, length } from "./vec.ts";

const DT = 0.05;
const DEG = Math.PI / 180;

/** Runs steerShip for `seconds` with the same input. */
function sail(ship: Ship, steer: { x: number; y: number }, seconds: number, boosting = false): Ship {
  let s = ship;
  for (let t = 0; t < seconds - 1e-9; t += DT) s = steerShip(s, { steer, boost: boosting }, boosting, DT);
  return s;
}

describe("ship types: the table", () => {
  it("has five types, Frigate first, each with a name", () => {
    expect(SHIP_TYPES).toEqual(["frigate", "cutter", "ironclad", "gunboat", "longGun"]);
    expect(SHIP_TYPES.map((t) => SHIP_TYPE_NAMES[t])).toEqual(["Frigate", "Cutter", "Ironclad", "Gunboat", "Long gun"]);
    expect(isShipType("cutter")).toBe(true);
    expect(isShipType("raft")).toBe(false);
    expect(isShipType(3)).toBe(false);
  });

  it("uses the approved values", () => {
    const row = (t: ShipType) => {
      const s = TUNING.shipTypes[t];
      return [s.maxHealth, s.radius, s.maxSpeed, s.fireInterval, s.shotDamage, s.shotRange, s.energyMax, s.refillPerSecond];
    };
    expect(row("frigate")).toEqual([100, 28, 150, 0.4, 20, 600, 100, 5]);
    expect(row("cutter")).toEqual([75, 22, 175, 0.3, 15, 450, 80, 6.5]);
    expect(row("ironclad")).toEqual([140, 34, 125, 0.6, 30, 500, 130, 4]);
    expect(row("gunboat")).toEqual([80, 26, 155, 0.5, 27, 450, 100, 5]);
    expect(row("longGun")).toEqual([85, 30, 145, 0.7, 32, 850, 100, 5]);
  });

  it("turns the hull and the turret in step with speed (Frigate 180°/s and 360°/s)", () => {
    const turns = SHIP_TYPES.map((t) => Math.round(TUNING.shipTypes[t].turnRate / DEG));
    const turrets = SHIP_TYPES.map((t) => Math.round(TUNING.shipTypes[t].turretTurnRate / DEG));
    expect(turns).toEqual([180, 210, 150, 186, 174]);
    expect(turrets).toEqual([360, 420, 300, 372, 348]);
  });

  it("keeps the Frigate's values in the original ship, energy and gun sections", () => {
    const f = TUNING.shipTypes.frigate;
    expect([TUNING.ship.radius, TUNING.ship.maxSpeed, TUNING.ship.turnRate, TUNING.ship.maxHealth]).toEqual([f.radius, f.maxSpeed, f.turnRate, f.maxHealth]);
    expect([TUNING.energy.max, TUNING.energy.refillPerSecond]).toEqual([f.energyMax, f.refillPerSecond]);
    expect([TUNING.gun.fireInterval, TUNING.gun.shotRange, TUNING.gun.shotDamage]).toEqual([f.fireInterval, f.shotRange, f.shotDamage]);
  });

  it("damage per second stays near 50 for every type", () => {
    for (const t of SHIP_TYPES) {
      const s = TUNING.shipTypes[t];
      expect(s.shotDamage / s.fireInterval).toBeGreaterThanOrEqual(45);
      expect(s.shotDamage / s.fireInterval).toBeLessThanOrEqual(55);
    }
  });
});

describe("ship types: sailing", () => {
  it.each(SHIP_TYPES)("a %s reaches its own top speed, and boosts to 1.8 times it", (type) => {
    const { maxSpeed } = TUNING.shipTypes[type];
    expect(length(sail(testShip({ type }), { x: 1, y: 0 }, 5).vel)).toBeCloseTo(maxSpeed, 0);
    expect(length(sail(testShip({ type }), { x: 1, y: 0 }, 5, true).vel)).toBeCloseTo(maxSpeed * TUNING.boost.speedMultiplier, 0);
  });

  it.each(SHIP_TYPES)("a %s turns its bow at its own rate", (type) => {
    const turned = steerShip(testShip({ type, heading: 0 }), { steer: { x: -1, y: 0 }, boost: false }, false, 0.1);
    expect(Math.abs(turned.heading)).toBeCloseTo(TUNING.shipTypes[type].turnRate * 0.1, 6);
  });

  it("stops each type at the sea edge by its own size", () => {
    const cutter = keepInSea(testShip({ type: "cutter", pos: { x: 0, y: 300 } }));
    const ironclad = keepInSea(testShip({ type: "ironclad", pos: { x: 0, y: 300 } }));
    expect(cutter.pos.x).toBe(22);
    expect(ironclad.pos.x).toBe(34);
  });
});

describe("ship types: the gun", () => {
  it.each(SHIP_TYPES)("a %s turret swings toward the aim at its own rate, and settles on it", (type) => {
    const ship = testShip({ type, turret: 0 });
    const swung = aimTurret(ship, { x: -1, y: 0 }, 0.1);
    expect(Math.abs(swung.turret)).toBeCloseTo(TUNING.shipTypes[type].turretTurnRate * 0.1, 6);
    const settled = aimTurret(ship, { x: 0, y: 1 }, 1);
    expect(settled.turret).toBeCloseTo(Math.PI / 2, 9);
  });

  it("keeps the last aim for a zero or broken aim", () => {
    const ship = testShip({ turret: 1 });
    expect(aimTurret(ship, { x: 0, y: 0 }, DT).turret).toBe(1);
    expect(aimTurret(ship, { x: Number.NaN, y: 1 }, DT).turret).toBe(1);
  });

  it.each(SHIP_TYPES)("a %s fires at its own interval, with its own damage and range on the shot", (type) => {
    const s = TUNING.shipTypes[type];
    const fired = fireGun(testShip({ type }), { aim: { x: 1, y: 0 }, fire: true, shield: false }, DT, 0);
    expect(fired.ship.fireCooldown).toBe(s.fireInterval);
    expect(fired.shot).toMatchObject({ damage: s.shotDamage, range: s.shotRange });
    expect(length(fired.shot!.vel)).toBeCloseTo(TUNING.gun.shotSpeed, 9);
  });

  it("a shot stops at its own range (the Long gun's 850, a Cutter's 450)", () => {
    const flyOut = (type: ShipType) => {
      let shot = fireGun(testShip({ type }), { aim: { x: 1, y: 0 }, fire: true, shield: false }, DT, 0).shot!;
      for (let i = 0; i < 200; i++) {
        const moved = moveShot(shot, DT);
        shot = moved.shot;
        if (moved.expired) break;
      }
      return shot.travelled;
    };
    expect(flyOut("longGun")).toBeCloseTo(850, 6);
    expect(flyOut("cutter")).toBeCloseTo(450, 6);
  });

  it("a shot passing 25 from a ship's centre misses a Cutter (22) and hits an Ironclad (34)", () => {
    const from = { x: 100, y: 275 };
    const to = { x: 500, y: 275 };
    const target = (type: ShipType) => testShip({ id: 1, type, pos: { x: 300, y: 300 } });
    expect(traceShot(0, from, to, [target("cutter")], []).kind).toBe("none");
    expect(traceShot(0, from, to, [target("ironclad")], []).kind).toBe("ship");
  });
});

describe("ship types: energy", () => {
  it("fills to the type's own bar at its own rate", () => {
    const refill = (max: number, refillPerSecond: number) =>
      updateEnergy({ energy: 10, locked: false, boosting: false, shielding: false }, 0, { boost: false, shield: false }, 1, { max, refillPerSecond }).state.energy;
    expect(refill(80, 6.5)).toBeCloseTo(16.5, 9);
    expect(updateEnergy({ energy: 129, locked: false, boosting: false, shielding: false }, 0, { boost: false, shield: false }, 1, { max: 130, refillPerSecond: 4 }).state.energy).toBe(130);
  });

  it("costs the same to boost and shield, and restarts at 20, for every type", () => {
    const bar = { max: 80, refillPerSecond: 6.5 };
    const boosted = updateEnergy({ energy: 50, locked: false, boosting: false, shielding: false }, 0, { boost: true, shield: false }, 1, bar);
    expect(boosted.state.energy).toBeCloseTo(50 - TUNING.boost.energyPerSecond, 9);
    const locked = updateEnergy({ energy: 19.9, locked: true, boosting: false, shielding: false }, 0, { boost: true, shield: false }, 0.001, bar);
    expect(locked.state.boosting).toBe(false);
    const restarted = updateEnergy({ energy: 20, locked: true, boosting: false, shielding: false }, 0, { boost: true, shield: false }, 0.001, bar);
    expect(restarted.state.boosting).toBe(true);
  });

  it("a ship's step uses its own bar (an Ironclad refills to 130)", () => {
    let world = createWorld({ types: ["ironclad", "cutter"] });
    world = { ...world, ships: world.ships.map((s) => ({ ...s, energy: 120 })) };
    for (let i = 0; i < 100; i++) world = step(world, [NO_INPUT, NO_INPUT], DT).world;
    expect(world.ships[0]!.energy).toBe(130);
    expect(world.ships[1]!.energy).toBe(80);
  });
});

describe("ship types: health, packs and hazards", () => {
  it("each ship starts and respawns with its type's full health and bar", () => {
    const world = createWorld({ types: ["cutter", "ironclad"] });
    expect(world.ships.map((s) => [s.type, s.health, s.energy])).toEqual([["cutter", 75, 80], ["ironclad", 140, 130]]);
    const back = respawnShip({ ...world.ships[1]!, health: 0, energy: 0, sunk: true }, { x: 100, y: 100 });
    expect([back.health, back.energy]).toEqual([140, 130]);
  });

  it("is all Frigates by default, as before", () => {
    expect(createWorld().ships.map((s) => s.type)).toEqual(["frigate", "frigate"]);
    expect(createWorld({ ships: 3 }).ships.map((s) => s.type)).toEqual(["frigate", "frigate", "frigate"]);
  });

  it("drops a mine behind its own stern and fires a torpedo from its own bow", () => {
    const at = { x: 500, y: 400 };
    for (const type of ["cutter", "ironclad"] as const) {
      const r = TUNING.shipTypes[type].radius;
      expect(distance(dropSpot(testShip({ type, pos: at })), at)).toBeCloseTo(r + TUNING.mine.radius + 2, 9);
      expect(distance(launchTorpedo(testShip({ type, pos: at }), 0).pos, at)).toBeCloseTo(r + 2, 9);
    }
  });

  it("a gun hit does the shooter's damage, whatever the target", () => {
    let world = createWorld({ types: ["ironclad", "cutter"] });
    const a = world.ships[0]!;
    world = {
      ...world,
      ships: [{ ...a, pos: { x: 400, y: 150 }, turret: 0, heading: 0 }, { ...world.ships[1]!, pos: { x: 600, y: 150 } }],
    };
    const fire: ShipInput[] = [{ ...NO_INPUT, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } }, NO_INPUT];
    const events = [];
    for (let i = 0; i < 12; i++) {
      const r = step(world, i === 0 ? fire : [NO_INPUT, NO_INPUT], DT);
      world = r.world;
      events.push(...r.events);
    }
    const hit = events.find((e) => e.type === "hit");
    expect(hit).toMatchObject({ attacker: 0, target: 1, damage: 30 });
    expect(world.ships[1]!.health).toBe(45);
  });

  it("a hit records how far it was landed from", () => {
    let world = createWorld();
    world = {
      ...world,
      ships: [{ ...world.ships[0]!, pos: { x: 400, y: 150 }, turret: 0, heading: 0 }, { ...world.ships[1]!, pos: { x: 700, y: 150 } }],
    };
    const fire: ShipInput[] = [{ ...NO_INPUT, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } }, NO_INPUT];
    const events = [];
    for (let i = 0; i < 20; i++) {
      const r = step(world, i === 0 ? fire : [NO_INPUT, NO_INPUT], DT);
      world = r.world;
      events.push(...r.events);
    }
    const hit = events.find((e) => e.type === "hit") as { distance: number } | undefined;
    // Fired from the centre at 400; the target's edge is at 700 − 28.
    expect(hit?.distance).toBeCloseTo(272, 0);
  });

  it("a health pack heals a fixed amount, never above the ship's own full health", () => {
    let world = createWorld({ packs: true, types: ["ironclad", "cutter"], seed: 5 });
    world = { ...world, ships: world.ships.map((s) => ({ ...s, health: s.type === "ironclad" ? 120 : 30 })) };
    const spot = world.packSpots[0]!;
    world = {
      ...world,
      packs: [{ id: 0, spot: 0, type: "health", signalLeft: 0, lifeLeft: 40 }, { id: 1, spot: 1, type: "health", signalLeft: 0, lifeLeft: 40 }],
      ships: [{ ...world.ships[0]!, pos: spot }, { ...world.ships[1]!, pos: world.packSpots[1]! }],
    };
    const r = step(world, [NO_INPUT, NO_INPUT], DT);
    const healed = r.events.filter((e) => e.type === "healthRestored");
    expect(healed).toEqual([
      { type: "healthRestored", ship: 0, amount: 20 },
      { type: "healthRestored", ship: 1, amount: TUNING.packs.healthRestore * TUNING.ship.maxHealth },
    ]);
    expect(r.world.ships.map((s) => s.health)).toEqual([140, 30 + TUNING.packs.healthRestore * TUNING.ship.maxHealth]);
  });

  it("an Ironclad at 125 of 140 still takes a health pack (it isn't at its own full health)", () => {
    let world = createWorld({ packs: true, types: ["ironclad", "frigate"], seed: 5 });
    world = {
      ...world,
      packs: [{ id: 0, spot: 0, type: "health", signalLeft: 0, lifeLeft: 40 }],
      ships: [{ ...world.ships[0]!, health: 125, pos: world.packSpots[0]! }, world.ships[1]!],
    };
    expect(step(world, [NO_INPUT, NO_INPUT], DT).world.ships[0]!.health).toBe(140);
  });
});

describe("ship types: bumps", () => {
  it("two ships touch at the sum of their sizes", () => {
    const a = testShip({ id: 0, type: "cutter", pos: { x: 300, y: 300 } });
    expect(separateShips(a, testShip({ id: 1, type: "ironclad", pos: { x: 357, y: 300 } })).touching).toBe(false);
    expect(separateShips(a, testShip({ id: 1, type: "ironclad", pos: { x: 350, y: 300 } })).touching).toBe(true);
  });

  it("shares the push by area: an Ironclad moves 30% of the overlap and a Cutter 70%", () => {
    const cutter = testShip({ id: 0, type: "cutter", pos: { x: 300, y: 300 } });
    const ironclad = testShip({ id: 1, type: "ironclad", pos: { x: 346, y: 300 } });
    const r = separateShips(cutter, ironclad);
    const overlap = 22 + 34 - 46;
    const share = (22 * 22) / (22 * 22 + 34 * 34);
    expect(300 - r.a.pos.x).toBeCloseTo(overlap * (1 - share), 9);
    expect(r.b.pos.x - 346).toBeCloseTo(overlap * share, 9);
    expect(r.b.pos.x - r.a.pos.x).toBeCloseTo(56, 9);
  });

  it("takes out the closing speed in the same shares (the smaller ship gives more)", () => {
    const cutter = testShip({ id: 0, type: "cutter", pos: { x: 300, y: 300 }, vel: { x: 100, y: 0 } });
    const ironclad = testShip({ id: 1, type: "ironclad", pos: { x: 355, y: 300 }, vel: { x: -100, y: 0 } });
    const r = separateShips(cutter, ironclad);
    const share = (22 * 22) / (22 * 22 + 34 * 34);
    expect(r.closingSpeed).toBeCloseTo(200, 9);
    expect(r.a.vel.x).toBeCloseTo(100 - 200 * (1 - share), 9);
    expect(r.b.vel.x).toBeCloseTo(-100 + 200 * share, 9);
  });

  it("two ships of one size still share the push equally", () => {
    const r = separateShips(testShip({ id: 0, pos: { x: 300, y: 300 } }), testShip({ id: 1, pos: { x: 346, y: 300 } }));
    expect(300 - r.a.pos.x).toBeCloseTo(5, 9);
    expect(r.b.pos.x - 346).toBeCloseTo(5, 9);
  });
});

describe("statsOf", () => {
  it("gives a ship its type's values", () => {
    expect(statsOf(testShip({ type: "longGun" })).shotRange).toBe(850);
    expect(statsOf(testShip()).radius).toBe(28);
  });
});
