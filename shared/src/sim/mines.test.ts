import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { createWorld } from "./match.ts";
import { step } from "./step.ts";
import type { Mine, ShipInput, SimEvent, World } from "./types.ts";

const DT = 0.05;
const M = TUNING.mine;
const FULL = TUNING.ship.maxHealth;
const DROP_BEHIND = TUNING.ship.radius + M.radius + 2;

const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const pilotPack: ShipInput = { ...idle, pilot: { ...idle.pilot, pack: true } };
const gunnerPack: ShipInput = { ...idle, gunner: { ...idle.gunner, pack: true } };

/** Packs on, nothing spawning; ship 0 at (400, 300) facing east, ship 1 far away at (1300, 700). */
function world(changes: (w: World) => void = () => {}): World {
  const w = createWorld({ packs: true, seed: 1 });
  w.nextSignalIn = null;
  w.ships[0] = { ...w.ships[0]!, pos: { x: 400, y: 300 }, heading: 0, held: "mine" };
  w.ships[1] = { ...w.ships[1]!, pos: { x: 1300, y: 700 } };
  changes(w);
  return w;
}

function run(w: World, seconds: number, inputs: (w: World) => (ShipInput | undefined)[] = () => []) {
  const log: { t: number; e: SimEvent }[] = [];
  let cur = w;
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
    const r = step(cur, inputs(cur), DT);
    cur = r.world;
    for (const e of r.events) log.push({ t: Math.round(cur.time * 1000) / 1000, e });
  }
  return { world: cur, log, events: log.map((l) => l.e) };
}

const armedMine = (pos: { x: number; y: number }, owner = 0, id = 0): Mine => ({ id, owner, pos, age: M.armTime });

describe("dropping a mine", () => {
  it("the pilot drops it just behind the stern; the slot empties", () => {
    const { world: after, events } = run(world(), DT, () => [pilotPack]);
    expect(after.mines).toEqual([{ id: 0, owner: 0, pos: { x: 400 - DROP_BEHIND, y: 300 }, age: 0 }]);
    expect(after.ships[0]!.held).toBeNull();
    expect(events).toContainEqual({ type: "packUsed", ship: 0, packType: "mine", role: "pilot" });
    expect(events).toContainEqual({ type: "mineDropped", mine: 0, owner: 0, pos: { x: 400 - DROP_BEHIND, y: 300 } });
  });

  it("follows the heading: facing south, it drops to the north", () => {
    const { world: after } = run(world((w) => { w.ships[0] = { ...w.ships[0]!, heading: Math.PI / 2 }; }), DT, () => [pilotPack]);
    expect(after.mines[0]!.pos.x).toBeCloseTo(400);
    expect(after.mines[0]!.pos.y).toBeCloseTo(300 - DROP_BEHIND);
  });

  it("is used once: holding the button doesn't drop another", () => {
    const { world: after } = run(world(), 1, () => [pilotPack]);
    expect(after.mines).toHaveLength(1);
  });

  it("only the pilot can drop it: the gunner's Pack button does nothing", () => {
    const { world: after, events } = run(world(), 0.5, () => [gunnerPack]);
    expect(after.mines).toEqual([]);
    expect(after.ships[0]!.held).toBe("mine");
    expect(events.filter((e) => e.type === "packUsed")).toEqual([]);
  });

  it("does nothing without a mine loaded", () => {
    const { world: after } = run(world((w) => { w.ships[0] = { ...w.ships[0]!, held: "torpedo" }; }), DT, () => [pilotPack]);
    expect(after.mines).toEqual([]);
    expect(after.ships[0]!.held).toBe("torpedo");
  });

  it("keeps the mine when the spot behind the stern is in the island", () => {
    // Island's left vertex is at (660, 420): a ship facing west just to its right drops into the island.
    const w = world((w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: 620, y: 420 }, heading: Math.PI }; });
    const { world: after } = run(w, DT, () => [pilotPack]);
    expect(after.mines).toEqual([]);
    expect(after.ships[0]!.held).toBe("mine");
  });

  it("keeps the mine when the spot behind the stern is off the sea", () => {
    const w = world((w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: 40, y: 300 }, heading: 0 }; });
    const { world: after } = run(w, DT, () => [pilotPack]);
    expect(after.mines).toEqual([]);
    expect(after.ships[0]!.held).toBe("mine");
  });

  it("a sunk ship can't drop its mine (it was lost when the ship sank)", () => {
    const w = world((w) => { w.ships[0] = { ...w.ships[0]!, sunk: true, respawnIn: 2, held: null }; });
    expect(run(w, DT, () => [pilotPack]).world.mines).toEqual([]);
  });
});

describe("arming, triggering and expiry", () => {
  /** Ship 0 drops a mine at (350, 300); ship 1 then waits right on that spot. */
  const enemyOnDrop = () => world((w) => { w.ships[1] = { ...w.ships[1]!, pos: { x: 400 - DROP_BEHIND, y: 300 + 30 } }; });

  it(`arms ${M.armTime} s after the drop; touching it before then does nothing`, () => {
    let w = run(enemyOnDrop(), DT, () => [pilotPack]).world;
    const before = run(w, M.armTime - DT);
    expect(before.events.filter((e) => e.type === "mineArmed" || e.type === "mineTriggered")).toEqual([]);
    expect(before.world.ships[1]!.health).toBe(FULL);

    const at = run(before.world, DT);
    expect(at.events).toContainEqual({ type: "mineArmed", mine: 0, owner: 0 });
    expect(at.world.mines).toEqual([]);
    expect(at.world.ships[1]!.health).toBeCloseTo(FULL * (1 - M.damage));
  });

  it(`deals ${M.damage * 100}% of full health and records the hit`, () => {
    const w = world((w) => {
      w.mines = [armedMine({ x: 800, y: 700 })];
      w.ships[1] = { ...w.ships[1]!, pos: { x: 800 + 40, y: 700 } };
    });
    const { world: after, events } = run(w, DT);
    expect(after.ships[1]!.health).toBeCloseTo(FULL * (1 - M.damage));
    expect(events).toContainEqual({
      type: "mineTriggered", mine: 0, owner: 0, shooter: null,
      hits: [{ ship: 1, damage: FULL * M.damage, ownMine: false }],
    });
  });

  it("is set off by touch: centres closer than ship radius + mine radius", () => {
    const reach = TUNING.ship.radius + M.radius;
    const near = world((w) => { w.mines = [armedMine({ x: 800, y: 700 })]; w.ships[1] = { ...w.ships[1]!, pos: { x: 800 + reach - 1, y: 700 } }; });
    expect(run(near, DT).world.mines).toEqual([]);
    const far = world((w) => { w.mines = [armedMine({ x: 800, y: 700 })]; w.ships[1] = { ...w.ships[1]!, pos: { x: 800 + reach + 1, y: 700 } }; });
    expect(run(far, DT).world.mines).toHaveLength(1);
  });

  it("hits its own ship too", () => {
    const w = world((w) => { w.mines = [armedMine({ x: 400 - 40, y: 300 })]; });
    const { world: after, events } = run(w, DT);
    expect(after.ships[0]!.health).toBeCloseTo(FULL * (1 - M.damage));
    expect(events).toContainEqual(expect.objectContaining({ type: "mineTriggered", hits: [{ ship: 0, damage: FULL * M.damage, ownMine: true }] }));
  });

  it(`hurts every ship within the blast (radius ${M.blastRadius}), not just the one that touched it`, () => {
    const blastReach = TUNING.ship.radius + M.blastRadius;
    const w = world((w) => {
      w.mines = [armedMine({ x: 800, y: 700 })];
      w.ships[1] = { ...w.ships[1]!, pos: { x: 800 + 40, y: 700 } }; // touches it: sets it off
      w.ships[0] = { ...w.ships[0]!, pos: { x: 800 - (blastReach - 1), y: 700 } }; // not touching, but in the blast
    });
    const { world: after } = run(w, DT);
    expect(after.ships.map((s) => s.health)).toEqual([FULL * (1 - M.damage), FULL * (1 - M.damage)]);
  });

  it("spares ships outside the blast", () => {
    const blastReach = TUNING.ship.radius + M.blastRadius;
    const w = world((w) => {
      w.mines = [armedMine({ x: 800, y: 700 })];
      w.ships[1] = { ...w.ships[1]!, pos: { x: 800 + 40, y: 700 } };
      w.ships[0] = { ...w.ships[0]!, pos: { x: 800 - (blastReach + 1), y: 700 } };
    });
    expect(run(w, DT).world.ships[0]!.health).toBe(FULL);
  });

  it("a raised shield halves the damage", () => {
    const w = world((w) => {
      w.mines = [armedMine({ x: 800, y: 700 })];
      w.ships[1] = { ...w.ships[1]!, pos: { x: 840, y: 700 } };
    });
    const shield: ShipInput = { ...idle, gunner: { ...idle.gunner, shield: true } };
    const { world: after } = run(w, DT, () => [idle, shield]);
    expect(after.ships[1]!.health).toBeCloseTo(FULL * (1 - M.damage * M.shieldFactor));
  });

  it("respawn protection blocks the damage, but the mine still goes off", () => {
    const w = world((w) => {
      w.mines = [armedMine({ x: 800, y: 700 })];
      w.ships[1] = { ...w.ships[1]!, pos: { x: 840, y: 700 }, protection: 1.5 };
    });
    const { world: after, events } = run(w, DT);
    expect(after.mines).toEqual([]);
    expect(after.ships[1]!.health).toBe(FULL);
    expect(events).toContainEqual(expect.objectContaining({ type: "mineTriggered", hits: [{ ship: 1, damage: 0, ownMine: false }] }));
  });

  it(`expires ${M.lifetime} s after the drop if nobody touches it`, () => {
    const dropped = run(world(), DT, () => [pilotPack]).world;
    const before = run(dropped, M.lifetime - DT);
    expect(before.world.mines).toHaveLength(1);
    const after = run(before.world, DT);
    expect(after.world.mines).toEqual([]);
    expect(after.events).toContainEqual({ type: "mineExpired", mine: 0, owner: 0 });
  });
});

describe("sinking by mine", () => {
  it("credits the mine's owner", () => {
    const w = world((w) => {
      w.mines = [armedMine({ x: 800, y: 700 })];
      w.ships[1] = { ...w.ships[1]!, pos: { x: 840, y: 700 }, health: 10 };
    });
    const { world: after, events } = run(w, DT);
    expect(events).toContainEqual({ type: "sunk", ship: 1, by: 0 });
    expect(after.ships[0]!.sinkings).toBe(1);
  });

  it("gives nobody the sinking when a ship sinks on its own mine", () => {
    const w = world((w) => {
      w.mines = [armedMine({ x: 360, y: 300 })];
      w.ships[0] = { ...w.ships[0]!, health: 10 };
    });
    const { world: after, events } = run(w, DT);
    expect(events).toContainEqual({ type: "sunk", ship: 0, by: null });
    expect(after.ships.map((s) => s.sinkings)).toEqual([0, 0]);
  });
});

describe("shots and mines", () => {
  /** Ship 0 at (400, 300) firing east; a mine at (600, 300); ship 1 next to the mine (in its blast, not touching it), out of the line of fire. */
  const fireEast: ShipInput = { ...idle, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } };
  const setUp = (mine: Mine, enemyHealth: number = FULL) => world((w) => {
    w.ships[0] = { ...w.ships[0]!, held: null };
    w.mines = [mine];
    w.ships[1] = { ...w.ships[1]!, pos: { x: 600, y: 300 + 70 }, health: enemyHealth };
  });

  it("a shot sets off an armed mine: the shot is used up and ships in the blast are hurt", () => {
    const { world: after, events } = run(setUp(armedMine({ x: 600, y: 300 }, 1)), 0.6, () => [fireEast]);
    expect(events).toContainEqual({
      type: "mineTriggered", mine: 0, owner: 1, shooter: 0,
      hits: [{ ship: 1, damage: FULL * M.damage, ownMine: true }],
    });
    expect(after.mines).toEqual([]);
    expect(events.filter((e) => e.type === "hit")).toEqual([]);
  });

  it("credits the shooter if the blast sinks a ship", () => {
    const { world: after, events } = run(setUp(armedMine({ x: 600, y: 300 }, 1), 10), 0.6, () => [fireEast]);
    expect(events).toContainEqual({ type: "sunk", ship: 1, by: 0 });
    expect(after.ships[0]!.sinkings).toBe(1);
  });

  it("gives nobody the sinking if the shooter's blast sinks the shooter's own ship", () => {
    const w = world((w) => {
      w.ships[0] = { ...w.ships[0]!, held: null, health: 10 };
      w.mines = [armedMine({ x: 400 + 70, y: 300 }, 1)]; // in the blast, not touching
    });
    const { events } = run(w, 0.2, () => [fireEast]);
    expect(events).toContainEqual({ type: "sunk", ship: 0, by: null });
  });

  it("an unarmed mine doesn't stop shots", () => {
    const { world: after } = run(setUp({ id: 0, owner: 1, pos: { x: 600, y: 300 }, age: 0 }), 0.6, () => [fireEast]);
    expect(after.mines).toHaveLength(1);
    expect(after.shots.length).toBeGreaterThan(0);
  });
});

describe("packs off", () => {
  it("never has mines", () => {
    const w = createWorld();
    w.ships[0] = { ...w.ships[0]!, held: "mine" }; // can't happen with packs off; even so nothing drops
    expect(run(w, 0.5, () => [pilotPack]).world.mines).toEqual([]);
  });
});
