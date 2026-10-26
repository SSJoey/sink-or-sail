import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { bumpDamage } from "./combat.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { LAYOUTS, LAYOUT_IDS } from "./layouts.ts";
import { createWorld } from "./match.ts";
import { step } from "./step.ts";
import type { PackType, ShipInput, SimEvent, World } from "./types.ts";
import { placeWrecks, wreckHull } from "./wrecks.ts";

const DT = 0.05;
const FULL = TUNING.ship.maxHealth;
const R = TUNING.ship.radius;
const WRECK = TUNING.wreck;
const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const east = (boost = false): ShipInput => ({ ...idle, pilot: { steer: { x: 1, y: 0 }, boost } });
const fireEast: ShipInput = { ...idle, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } };

/** Open sea (islands and reefs cleared) with one wreck standing upright in the middle at (800, 450), 26 across. */
const MIDDLE = { x: 800, y: 450 };
function world(pack: PackType | null = null, setUp: (w: World) => void = () => {}): World {
  const w = createWorld({ hazards: true, packs: true });
  w.islands = [];
  w.reefs = [];
  w.nextSignalIn = null;
  w.wrecks = placeWrecks([{ pos: MIDDLE, angle: Math.PI / 2 }], false, 1, []).map((wreck) => ({ ...wreck, pack }));
  // Ship 0 west of the wreck facing east; ship 1 behind it, to the east.
  w.ships[0] = { ...w.ships[0]!, pos: { x: 600, y: 450 }, heading: 0, turret: 0 };
  w.ships[1] = { ...w.ships[1]!, pos: { x: 1000, y: 450 } };
  setUp(w);
  return w;
}

function run(w: World, seconds: number, inputs: (w: World) => (ShipInput | undefined)[]) {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = step(w, inputs(w), DT);
    w = r.world;
    events.push(...r.events);
  }
  return { world: w, events };
}
const ofType = <T extends SimEvent["type"]>(events: SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe("wrecks in a match", () => {
  it("come only with hazards on: every one of the layout's wrecks at full health", () => {
    expect(createWorld().wrecks).toEqual([]);
    expect(createWorld({ packs: true }).wrecks).toEqual([]);
    for (const layout of LAYOUT_IDS) {
      const w = createWorld({ hazards: true, layout });
      expect(w.wrecks.map((x) => x.pos)).toEqual(LAYOUTS[layout].wrecks.map((s) => s.pos));
      expect(w.wrecks.map((x) => x.hull)).toEqual(LAYOUTS[layout].wrecks.map(wreckHull));
      expect(w.wrecks.every((x) => x.health === WRECK.health)).toBe(true);
      expect(w.wrecks.map((x) => x.id)).toEqual(LAYOUTS[layout].wrecks.map((_, i) => i));
    }
    expect(createWorld({ hazards: true }).wreckPacks).toEqual([]);
  });

  it(`hold a pack ${WRECK.packChance * 100}% of the time (with the seed), any of the four types, and none with packs off`, () => {
    for (const seed of [1, 8, 367]) {
      expect(createWorld({ hazards: true, packs: true, seed }).wrecks).toEqual(createWorld({ hazards: true, packs: true, seed }).wrecks);
      expect(createWorld({ hazards: true, seed }).wrecks.every((x) => x.pack === null)).toBe(true);
    }
    const packs = Array.from({ length: 400 }, (_, seed) => createWorld({ hazards: true, packs: true, seed }).wrecks.map((x) => x.pack)).flat();
    const holding = packs.filter((p) => p !== null);
    expect(holding.length / packs.length).toBeGreaterThan(0.45);
    expect(holding.length / packs.length).toBeLessThan(0.55);
    expect(new Set(holding)).toEqual(new Set(["mine", "torpedo", "emp", "health"]));
  });

  it("leave the map's packs unchanged: the same seed gives the same packs with hazards on or off", () => {
    for (const seed of [1, 8, 367]) {
      expect(createWorld({ hazards: true, packs: true, seed }).rng).toBe(createWorld({ packs: true, seed }).rng);
    }
  });
});

describe("a wreck", () => {
  it("stops ships like a rock", () => {
    const { world: after } = run(world(), 3, () => [east(), idle]);
    const ship = after.ships[0]!;
    expect(ship.pos.x).toBeLessThan(MIDDLE.x - WRECK.width / 2 - R + 1);
    expect(circleOverlapsPolygon(ship.pos, R - 0.5, after.wrecks[0]!.hull)).toBeNull();
  });

  it(`stops shots and takes ${TUNING.gun.shotDamage} per hit; the ship behind it is safe`, () => {
    const { world: after, events } = run(world(), 0.9, () => [fireEast, idle]);
    expect(ofType(events, "hit")).toEqual([]);
    const hits = ofType(events, "wreckHit");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toEqual({ type: "wreckHit", wreck: 0, by: 0, weapon: "shot", damage: TUNING.gun.shotDamage });
    expect(after.wrecks[0]!.health).toBe(WRECK.health - hits.length * TUNING.gun.shotDamage);
  });

  it(`is destroyed by ${WRECK.health / TUNING.gun.shotDamage} shots (credited to the shooter), then gone: shots pass where it was`, () => {
    const { world: after, events } = run(world(), 3, () => [fireEast, idle]);
    expect(ofType(events, "wreckHit")).toHaveLength(WRECK.health / TUNING.gun.shotDamage);
    expect(ofType(events, "wreckDestroyed")).toEqual([{ type: "wreckDestroyed", wreck: 0, by: 0 }]);
    expect(after.wrecks).toEqual([]);
    expect(ofType(events, "hit").some((e) => e.target === 1)).toBe(true);
    // No pack in it: nothing released.
    expect(ofType(events, "wreckPackReleased")).toEqual([]);
    expect(after.wreckPacks).toEqual([]);
  });

  it(`stops torpedoes and takes ${TUNING.torpedo.damage * FULL} from one`, () => {
    const w = world(null, (w) => { w.ships[0] = { ...w.ships[0]!, gunnerPack: "torpedo" }; });
    const torpedo: ShipInput = { ...idle, gunner: { ...idle.gunner, pack: true } };
    const { world: after, events } = run(w, 2, (w) => [w.time < DT ? torpedo : idle, idle]);
    expect(ofType(events, "wreckHit")).toEqual([{ type: "wreckHit", wreck: 0, by: 0, weapon: "torpedo", damage: TUNING.torpedo.damage * FULL }]);
    expect(ofType(events, "torpedoEnded")).toEqual([{ type: "torpedoEnded", torpedo: 0, owner: 0, reason: "wreck" }]);
    expect(ofType(events, "torpedoHit")).toEqual([]);
    expect(after.wrecks[0]!.health).toBe(WRECK.health - TUNING.torpedo.damage * FULL);
  });

  it(`takes ${TUNING.mine.damage * FULL} from a mine blast: credited to whoever set it off (the owner when sailed into)`, () => {
    // An armed mine of ship 1's just west of the wreck; ship 0 sails into it.
    const sailedInto = world(null, (w) => {
      w.mines = [{ id: 0, owner: 1, pos: { x: MIDDLE.x - 60, y: MIDDLE.y }, age: 5 }];
      w.ships[0] = { ...w.ships[0]!, pos: { x: MIDDLE.x - 150, y: MIDDLE.y } };
    });
    const a = run(sailedInto, 1.5, () => [east(), idle]);
    // (Sailing on, it rams the wreck too.)
    expect(ofType(a.events, "wreckHit").filter((e) => e.weapon === "mine")).toEqual([{ type: "wreckHit", wreck: 0, by: 1, weapon: "mine", damage: TUNING.mine.damage * FULL }]);

    // Ship 0 shoots ship 1's mine: credited to ship 0.
    const shot = world(null, (w) => { w.mines = [{ id: 0, owner: 1, pos: { x: MIDDLE.x - 60, y: MIDDLE.y }, age: 5 }]; });
    const b = run(shot, 1, (w) => [w.mines.length > 0 ? fireEast : idle, idle]);
    expect(ofType(b.events, "wreckHit")[0]).toEqual({ type: "wreckHit", wreck: 0, by: 0, weapon: "mine", damage: TUNING.mine.damage * FULL });
  });

  it("can't have a mine dropped onto it", () => {
    // Ship 0 just east of the wreck, facing east: its stern is against the hull.
    const w = world(null, (w) => { w.ships[0] = { ...w.ships[0]!, pos: { x: MIDDLE.x + WRECK.width / 2 + R + 4, y: MIDDLE.y }, pilotPack: "mine" }; });
    const after = step(w, [{ ...idle, pilot: { ...idle.pilot, pack: true } }, idle], DT);
    expect(after.world.mines).toEqual([]);
    expect(after.world.ships[0]!.pilotPack).toBe("mine");
  });
});

describe("ramming a wreck", () => {
  /** Ship 0 sailing east into the wreck at `speed`, just short of it. */
  const ramming = (speed: number, overrides = {}) =>
    world(null, (w) => {
      w.ships[0] = { ...w.ships[0]!, pos: { x: MIDDLE.x - WRECK.width / 2 - R - 2, y: MIDDLE.y }, vel: { x: speed, y: 0 }, ...overrides };
    });
  const boosted = TUNING.ship.maxSpeed * TUNING.boost.speedMultiplier;

  it(`hurts the ship like a bump and the wreck ${WRECK.ramFactor}×, once per contact`, () => {
    const { world: after, events } = run(ramming(boosted), 1, () => [east(true), idle]);
    const rams = ofType(events, "wreckHit");
    expect(rams).toHaveLength(1);
    const ram = rams[0]!;
    expect(ram.weapon).toBe("bump");
    expect(ram.by).toBe(0);
    expect(ram.shipDamage).toBeGreaterThan(5);
    expect(ram.damage).toBeCloseTo(ram.shipDamage! * WRECK.ramFactor);
    expect(ram.shipDamage).toBeLessThanOrEqual(bumpDamage(boosted) + 1e-9);
    expect(after.ships[0]!.health).toBeCloseTo(FULL - ram.shipDamage!);
    expect(after.wrecks[0]!.health).toBeCloseTo(WRECK.health - ram.damage);
  });

  it("does nothing slower than a bump's minimum speed", () => {
    const { events } = run(ramming(TUNING.bump.minSpeed * 0.8), 0.2, () => [idle, idle]);
    expect(ofType(events, "wreckHit")).toEqual([]);
  });

  it("a shield or respawn protection keeps the ship safe; the wreck still takes its hit", () => {
    for (const overrides of [{ protection: 2 }, { shielding: true }]) {
      const shield: ShipInput = { ...east(true), gunner: { ...idle.gunner, shield: "shielding" in overrides } };
      const { world: after, events } = run(ramming(boosted, overrides), 0.3, () => [shield, idle]);
      const ram = ofType(events, "wreckHit")[0]!;
      expect(ram.shipDamage).toBe(0);
      expect(ram.damage).toBeGreaterThan(10);
      expect(after.ships[0]!.health).toBe(FULL);
    }
  });

  it("breaking it by ramming credits the rammer; sinking on it credits nobody (cause wreck)", () => {
    const broken = run(world(null, (w) => {
      w.wrecks[0] = { ...w.wrecks[0]!, health: 1 };
      w.ships[0] = { ...w.ships[0]!, pos: { x: MIDDLE.x - WRECK.width / 2 - R - 2, y: MIDDLE.y }, vel: { x: boosted, y: 0 } };
    }), 0.2, () => [east(true), idle]);
    expect(ofType(broken.events, "wreckDestroyed")).toEqual([{ type: "wreckDestroyed", wreck: 0, by: 0 }]);

    const sunk = run(ramming(boosted, { health: 1 }), 0.2, () => [east(true), idle]);
    expect(sunk.events).toContainEqual({ type: "sunk", ship: 0, by: null, cause: "wreck" });
    expect(sunk.world.ships.map((s) => s.sinkings)).toEqual([0, 0]);
    const lastAfloat = world(null, (w) => {
      w.mode = "lastAfloat";
      w.ships = w.ships.map((s) => ({ ...s, livesLeft: 2 }));
      w.ships[0] = { ...w.ships[0]!, pos: { x: MIDDLE.x - WRECK.width / 2 - R - 2, y: MIDDLE.y }, vel: { x: boosted, y: 0 }, health: 1 };
    });
    expect(run(lastAfloat, 0.2, () => [east(true), idle]).events).toContainEqual({ type: "sunk", ship: 0, by: null, cause: "wreck", livesLeft: 1 });
  });
});

describe("a wreck's pack", () => {
  /** Ship 0 breaks a wreck holding `pack` with shots (three of them), then stops firing. */
  const breakIt = (pack: PackType, setUp: (w: World) => void = () => {}) =>
    run(world(pack, setUp), 2, (w) => [w.wrecks.length > 0 ? fireEast : idle, idle]);

  it("is released where the wreck was when it's destroyed, and doesn't count toward the map's pack limit", () => {
    const { world: after, events } = breakIt("torpedo", (w) => {
      // The map already has its two packs, at spots far away.
      w.packs = [{ id: 0, spot: 0, type: "mine", signalLeft: 0, lifeLeft: 40 }, { id: 1, spot: 1, type: "emp", signalLeft: 0, lifeLeft: 40 }];
      w.nextPackId = 2;
    });
    expect(ofType(events, "wreckPackReleased")).toEqual([{ type: "wreckPackReleased", wreck: 0, pack: 2, packType: "torpedo" }]);
    expect(after.wreckPacks).toHaveLength(1);
    expect(after.wreckPacks[0]).toMatchObject({ id: 2, wreck: 0, pos: MIDDLE, type: "torpedo" });
    expect(after.packs.map((p) => p.id)).toEqual([0, 1]);
    expect(after.nextSignalIn).toBeNull();
    expect(after.nextPackId).toBe(3);
  });

  it("can be picked up at once by sailing over it (no glow), into the right slot", () => {
    const broken = breakIt("torpedo").world;
    const { world: after, events } = run(broken, 3, (w) => [w.ships[0]!.pos.x < MIDDLE.x ? east() : idle, idle]);
    expect(ofType(events, "packPickedUp")).toEqual([{ type: "packPickedUp", ship: 0, pack: 0, packType: "torpedo" }]);
    expect(after.ships[0]!.gunnerPack).toBe("torpedo");
    expect(after.wreckPacks).toEqual([]);
  });

  it("a health pack heals on pickup; a ship at full health leaves it", () => {
    const broken = breakIt("health").world;
    const full = run(broken, 3, (w) => [w.ships[0]!.pos.x < MIDDLE.x ? east() : idle, idle]);
    expect(full.world.wreckPacks).toHaveLength(1);
    const hurt = run({ ...broken, ships: [{ ...broken.ships[0]!, health: 50 }, broken.ships[1]!] }, 3, (w) => [w.ships[0]!.pos.x < MIDDLE.x ? east() : idle, idle]);
    expect(ofType(hurt.events, "healthRestored")).toEqual([{ type: "healthRestored", ship: 0, amount: TUNING.packs.healthRestore * FULL }]);
  });

  it(`disappears after ${TUNING.packs.lifetime} s if nobody takes it`, () => {
    const broken = breakIt("mine").world;
    const left = broken.wreckPacks[0]!.lifeLeft;
    expect(left).toBeGreaterThan(TUNING.packs.lifetime - 2);
    const { world: after, events } = run(broken, left + 0.2, () => [idle, idle]);
    expect(ofType(events, "packExpired")).toEqual([{ type: "packExpired", pack: 0, spot: null, packType: "mine" }]);
    expect(after.wreckPacks).toEqual([]);
  });

  it("with packs off, a destroyed wreck releases nothing", () => {
    const w = world("mine", (w) => { w.packsOn = false; });
    const { world: after, events } = run(w, 2, () => [fireEast, idle]);
    expect(ofType(events, "wreckDestroyed")).toHaveLength(1);
    expect(ofType(events, "wreckPackReleased")).toEqual([]);
    expect(after.wreckPacks).toEqual([]);
  });

});

describe("a destroyed wreck", () => {
  it("stays gone for the rest of the match", () => {
    const { world: after, events } = run(world(), 90, () => [fireEast, idle]);
    expect(ofType(events, "wreckDestroyed")).toHaveLength(1);
    expect(after.wrecks).toEqual([]);
  });
});
