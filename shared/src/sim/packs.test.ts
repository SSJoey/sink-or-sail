import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { PACK_SPOTS, ISLAND, SPAWN_POINTS, START_POINTS } from "./map.ts";
import { createWorld } from "./match.ts";
import { freeSpots, signalPack } from "./packs.ts";
import { step } from "./step.ts";
import type { Pack, ShipInput, SimEvent, World } from "./types.ts";
import { circleOverlapsPolygon } from "./geometry.ts";
import { distance } from "./vec.ts";

const DT = 0.05;
const P = TUNING.packs;
const reach = TUNING.ship.radius + P.radius;

/** Steps the world, returning every event with the match time it happened at. */
function run(world: World, seconds: number, inputs: (w: World) => (ShipInput | undefined)[] = () => []) {
  const log: { t: number; e: SimEvent }[] = [];
  let w = world;
  for (let i = 0, n = Math.round(seconds / DT); i < n; i++) {
    const r = step(w, inputs(w), DT);
    w = r.world;
    for (const e of r.events) log.push({ t: Math.round(w.time * 1000) / 1000, e });
  }
  return { world: w, log, events: log.map((l) => l.e) };
}

const timesOf = (log: { t: number; e: SimEvent }[], type: SimEvent["type"]) => log.filter((l) => l.e.type === type).map((l) => l.t);
const readyPack = (id: number, spot: number, type: Pack["type"]): Pack => ({ id, spot, type, signalLeft: 0 });
const spotPos = (spot: number) => PACK_SPOTS[spot]!;

describe("spawn spots", () => {
  it("are the 6 agreed spots, in open water, well clear of the island, respawn and start spots", () => {
    expect(PACK_SPOTS).toHaveLength(6);
    for (const spot of PACK_SPOTS) {
      expect(circleOverlapsPolygon(spot, 150, ISLAND)).toBeNull();
      for (const p of [...SPAWN_POINTS, ...START_POINTS]) expect(distance(spot, p)).toBeGreaterThan(200);
    }
  });
});

describe("createWorld options", () => {
  it("has packs off by default, so Stage 0 is unchanged", () => {
    const world = createWorld();
    expect(world.packsOn).toBe(false);
    expect(world.packs).toEqual([]);
    expect(world.ships.every((s) => s.held === null)).toBe(true);
  });

  it("takes packs on/off and a seed", () => {
    const world = createWorld({ packs: true, seed: 42 });
    expect(world.packsOn).toBe(true);
    expect(world.rng).toBe(42);
  });
});

describe("spawn clock", () => {
  it("packs off: no packs, ever", () => {
    const { world, events } = run(createWorld({ seed: 5 }), 60);
    expect(world.packs).toEqual([]);
    expect(events.filter((e) => e.type.startsWith("pack"))).toEqual([]);
  });

  it(`signals the first pack at 0:${P.spawnInterval.toString().padStart(2, "0")}, one at a time, ${P.signalTime} s glow, then 8 s after each appears, until ${P.maxOnMap} are out`, () => {
    const { world, log } = run(createWorld({ packs: true, seed: 5 }), 60);
    expect(timesOf(log, "packSignalled")).toEqual([8, 19]);
    expect(timesOf(log, "packSpawned")).toEqual([11, 22]);
    expect(world.packs).toHaveLength(P.maxOnMap);
    expect(world.nextSignalIn).toBeNull();
  });

  it("shows a glowing pack as signalled until it appears", () => {
    const { world } = run(createWorld({ packs: true, seed: 5 }), 9);
    expect(world.packs).toHaveLength(1);
    expect(world.packs[0]!.signalLeft).toBeCloseTo(2, 5);
  });

  it("never has more than the limit on the map (glowing ones included)", () => {
    let w = createWorld({ packs: true, seed: 9 });
    for (let i = 0; i < 2400; i++) {
      w = step(w, [], DT).world;
      expect(w.packs.length).toBeLessThanOrEqual(P.maxOnMap);
      expect(w.packs.filter((p) => p.signalLeft > 0).length).toBeLessThanOrEqual(1);
    }
  });

  it("gives the same spots and types for the same seed, and different ones for different seeds", () => {
    const packsFor = (seed: number) => {
      let w = createWorld({ packs: true, seed });
      const seen: string[] = [];
      // Repeatedly clear the map so many packs get chosen.
      for (let i = 0; i < 3000; i++) {
        const r = step(w, [], DT);
        w = { ...r.world, packs: r.world.packs.filter((p) => p.signalLeft > 0) };
        if (r.world.packs.length === P.maxOnMap) w = { ...w, nextSignalIn: P.spawnInterval };
        for (const e of r.events) if (e.type === "packSignalled") seen.push(`${e.spot}:${e.packType}`);
      }
      return seen;
    };
    const a = packsFor(1);
    expect(a.length).toBeGreaterThan(10);
    expect(packsFor(1)).toEqual(a);
    expect(packsFor(2)).not.toEqual(a);
  });

  it(`signals a replacement ${P.spawnInterval} s after a pack is taken from a full map`, () => {
    const world = createWorld({ packs: true, seed: 3 });
    world.packs = [readyPack(0, 0, "mine"), readyPack(1, 1, "torpedo")];
    world.nextPackId = 2;
    world.nextSignalIn = null;
    world.time = 30;
    world.ships[0] = { ...world.ships[0]!, pos: spotPos(0) };
    const { log } = run(world, 12);
    expect(timesOf(log, "packPickedUp")).toEqual([30.05]);
    expect(timesOf(log, "packSignalled")).toEqual([38.05]);
  });
});

describe("freeSpots and signalPack", () => {
  it("skips spots holding a pack (glowing or not) and spots with a ship on them", () => {
    const world = createWorld({ packs: true, seed: 1 });
    world.packs = [readyPack(0, 1, "mine"), { id: 1, spot: 2, type: "emp", signalLeft: 2 }];
    world.ships[0] = { ...world.ships[0]!, pos: { x: spotPos(4).x + reach - 1, y: spotPos(4).y } };
    expect(freeSpots(world)).toEqual([0, 3, 5]);
  });

  it("ignores sunk ships when checking spots", () => {
    const world = createWorld({ packs: true, seed: 1 });
    world.ships[0] = { ...world.ships[0]!, pos: spotPos(0), sunk: true };
    expect(freeSpots(world)).toContain(0);
  });

  it("only ever signals a free spot, whatever the seed", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const world = createWorld({ packs: true, seed });
      world.packs = [readyPack(0, 0, "mine")];
      world.ships[1] = { ...world.ships[1]!, pos: spotPos(5) };
      const result = signalPack(world);
      expect(result).not.toBeNull();
      expect([1, 2, 3, 4]).toContain(result!.event.spot);
    }
  });

  it("does nothing when every spot is taken", () => {
    const world = createWorld({ packs: true, seed: 1 });
    world.packs = PACK_SPOTS.map((_, i) => readyPack(i, i, "health"));
    expect(signalPack(world)).toBeNull();
  });

  it("picks each pack type about equally often", () => {
    const counts: Record<string, number> = { mine: 0, torpedo: 0, emp: 0, health: 0 };
    let rng = 77;
    for (let i = 0; i < 4000; i++) {
      const world = { ...createWorld({ packs: true, seed: 1 }), rng };
      const r = signalPack(world)!;
      counts[r.event.packType]!++;
      rng = r.world.rng;
    }
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(850);
  });
});

describe("pickup and the pack slot", () => {
  /** Ship 0 sitting on spot 0, which holds a ready pack of the given type. */
  function onPack(type: Pack["type"], ship: Partial<World["ships"][number]> = {}) {
    const world = createWorld({ packs: true, seed: 1 });
    world.packs = [readyPack(0, 0, type)];
    world.nextPackId = 1;
    world.nextSignalIn = null;
    world.ships[0] = { ...world.ships[0]!, pos: spotPos(0), ...ship };
    return world;
  }

  it("picks a pack up by sailing over it, into the ship's slot", () => {
    const { world, events } = run(onPack("torpedo"), DT);
    expect(world.ships[0]!.held).toBe("torpedo");
    expect(world.packs).toEqual([]);
    expect(events).toContainEqual({ type: "packPickedUp", ship: 0, pack: 0, packType: "torpedo" });
  });

  it("picks up on touch: centres closer than ship radius + pack radius", () => {
    const near = onPack("mine", { pos: { x: spotPos(0).x + reach - 1, y: spotPos(0).y } });
    expect(run(near, DT).world.ships[0]!.held).toBe("mine");
    const far = onPack("mine", { pos: { x: spotPos(0).x + reach + 1, y: spotPos(0).y } });
    expect(run(far, DT).world.ships[0]!.held).toBeNull();
  });

  it("can't pick up a pack while holding one; the pack stays", () => {
    const { world } = run(onPack("mine", { held: "emp" }), DT);
    expect(world.ships[0]!.held).toBe("emp");
    expect(world.packs).toHaveLength(1);
  });

  it("can't pick up a pack that is still only glowing", () => {
    const world = onPack("mine");
    world.packs = [{ ...world.packs[0]!, signalLeft: 2 }];
    expect(run(world, DT).world.ships[0]!.held).toBeNull();
  });

  it("can pick up during respawn protection, but not while sunk", () => {
    expect(run(onPack("emp", { protection: 1.5 }), DT).world.ships[0]!.held).toBe("emp");
    expect(run(onPack("emp", { sunk: true, respawnIn: 2 }), DT).world.packs).toHaveLength(1);
  });

  it("loses the held pack when the ship sinks", () => {
    const world = createWorld({ packs: true, seed: 1 });
    world.nextSignalIn = null;
    world.ships[0] = { ...world.ships[0]!, pos: { x: 400, y: 200 }, heading: 0, turret: 0 };
    world.ships[1] = { ...world.ships[1]!, pos: { x: 600, y: 200 }, health: 20, held: "mine" };
    const fire: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } };
    const { world: after, events } = run(world, 1, () => [fire]);
    expect(after.ships[1]!.held).toBeNull();
    expect(events).toContainEqual({ type: "packLost", ship: 1, packType: "mine" });
  });
});

describe("health pack", () => {
  function hurtOnHealth(health: number, held: Pack["type"] | null = null) {
    const world = createWorld({ packs: true, seed: 1 });
    world.packs = [readyPack(0, 0, "health")];
    world.nextPackId = 1;
    world.nextSignalIn = null;
    world.ships[0] = { ...world.ships[0]!, pos: spotPos(0), health, held };
    return world;
  }
  const max = TUNING.ship.maxHealth;

  it(`restores ${P.healthRestore * 100}% of full health on pickup`, () => {
    const { world, events } = run(hurtOnHealth(30), DT);
    expect(world.ships[0]!.health).toBeCloseTo(30 + P.healthRestore * max);
    expect(events).toContainEqual({ type: "healthRestored", ship: 0, amount: P.healthRestore * max });
    expect(events).toContainEqual({ type: "packPickedUp", ship: 0, pack: 0, packType: "health" });
  });

  it("never heals above full", () => {
    const { world, events } = run(hurtOnHealth(max - 10), DT);
    expect(world.ships[0]!.health).toBe(max);
    expect(events).toContainEqual({ type: "healthRestored", ship: 0, amount: 10 });
  });

  it("doesn't use the slot: taken while holding another pack, which stays", () => {
    const { world } = run(hurtOnHealth(50, "torpedo"), DT);
    expect(world.ships[0]!.held).toBe("torpedo");
    expect(world.packs).toEqual([]);
  });

  it("isn't taken by a ship at full health", () => {
    const { world, events } = run(hurtOnHealth(max), DT);
    expect(world.packs).toHaveLength(1);
    expect(events.filter((e) => e.type === "packPickedUp")).toEqual([]);
  });
});
