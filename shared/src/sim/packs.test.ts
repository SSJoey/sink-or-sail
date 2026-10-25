import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { PACK_SPOTS, PACK_SPOTS_3, ISLAND, SEA_CENTRE, SPAWN_POINTS, START_POINTS, START_POINTS_3 } from "./map.ts";
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
const readyPack = (id: number, spot: number, type: Pack["type"], lifeLeft: number = P.lifetime): Pack => ({ id, spot, type, signalLeft: 0, lifeLeft });
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

describe("3-ship spawn spots", () => {
  it("are 6 spots in open water, well clear of the island, the respawn spots and the 3-ship starts", () => {
    expect(PACK_SPOTS_3).toHaveLength(6);
    for (const spot of PACK_SPOTS_3) {
      expect(circleOverlapsPolygon(spot, 150, ISLAND)).toBeNull();
      for (const p of [...SPAWN_POINTS, ...START_POINTS_3]) expect(distance(spot, p)).toBeGreaterThan(200);
    }
  });

  it("repeat every 120° around the middle, so no crew is favoured", () => {
    const turn = (p: { x: number; y: number }) => {
      const a = (2 * Math.PI) / 3;
      const dx = p.x - SEA_CENTRE.x;
      const dy = p.y - SEA_CENTRE.y;
      return { x: SEA_CENTRE.x + dx * Math.cos(a) - dy * Math.sin(a), y: SEA_CENTRE.y + dx * Math.sin(a) + dy * Math.cos(a) };
    };
    for (const spot of PACK_SPOTS_3) {
      const turned = turn(spot);
      expect(PACK_SPOTS_3.some((s) => distance(s, turned) < 1e-6)).toBe(true);
    }
  });

  it("are where a 3-ship match spawns and picks up its packs, still at most 2 on the map", () => {
    let w = createWorld({ packs: true, seed: 9, ships: 3 });
    const spots = new Set<number>();
    for (let i = 0; i < 2400; i++) {
      const r = step(w, [], DT);
      w = r.world;
      expect(w.packs.length).toBeLessThanOrEqual(P.maxOnMap);
      for (const e of r.events) if (e.type === "packSignalled") spots.add(e.spot);
    }
    expect([...spots].every((i) => i >= 0 && i < PACK_SPOTS_3.length)).toBe(true);

    const world = createWorld({ packs: true, seed: 1, ships: 3 });
    world.packs = [readyPack(0, 0, "torpedo")];
    world.nextPackId = 1;
    world.nextSignalIn = null;
    world.ships[2] = { ...world.ships[2]!, pos: PACK_SPOTS_3[0]! };
    const after = run(world, DT);
    expect(after.world.ships[2]!.gunnerPack).toBe("torpedo");
    expect(after.events).toContainEqual({ type: "packPickedUp", ship: 2, pack: 0, packType: "torpedo" });
  });
});

describe("createWorld options", () => {
  it("has packs off by default, so Stage 0 is unchanged", () => {
    const world = createWorld();
    expect(world.packsOn).toBe(false);
    expect(world.packs).toEqual([]);
    expect(world.ships.every((s) => s.pilotPack === null && s.gunnerPack === null)).toBe(true);
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
    const { world, log } = run(createWorld({ packs: true, seed: 5 }), 30);
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

describe("packs nobody picks up", () => {
  it(`disappear ${P.lifetime} s after appearing, not before; the glow doesn't count`, () => {
    // Out at 11 s and 22 s (map full); the first goes at 11 + lifetime, so a replacement is signalled 8 s later
    // and appears 3 s after that, just as the second goes.
    const { log } = run(createWorld({ packs: true, seed: 5 }), 22 + P.lifetime + 1);
    expect(timesOf(log, "packSpawned")).toEqual([11, 22, 22 + P.lifetime]);
    expect(timesOf(log, "packExpired")).toEqual([11 + P.lifetime, 22 + P.lifetime]);
  });

  it("logs which pack disappeared, from which spot, and its type", () => {
    const { log } = run(createWorld({ packs: true, seed: 5 }), 12 + P.lifetime);
    const spawned = log.find((l) => l.e.type === "packSpawned")!.e as Extract<SimEvent, { type: "packSpawned" }>;
    expect(log.find((l) => l.e.type === "packExpired")!.e).toEqual({ type: "packExpired", pack: spawned.pack, spot: spawned.spot, packType: spawned.packType });
  });

  it("counts down only once it has appeared", () => {
    const { world } = run(createWorld({ packs: true, seed: 5 }), 12);
    expect(world.packs[0]!.lifeLeft).toBeCloseTo(P.lifetime - 1, 5);
    const glowing = run(createWorld({ packs: true, seed: 5 }), 9).world.packs[0]!;
    expect(glowing.lifeLeft).toBe(P.lifetime);
  });

  it(`signals a replacement ${P.spawnInterval} s after a pack disappears from a full map`, () => {
    const world = createWorld({ packs: true, seed: 3 });
    world.packs = [readyPack(0, 0, "mine", 1), readyPack(1, 1, "torpedo")];
    world.nextPackId = 2;
    world.nextSignalIn = null;
    world.time = 30;
    const { world: after, log } = run(world, 10);
    expect(timesOf(log, "packExpired")).toEqual([31]);
    expect(after.packs.map((p) => p.id)).toContain(1);
    expect(timesOf(log, "packSignalled")).toEqual([39]);
  });

  it("can still be picked up just before it disappears", () => {
    const world = createWorld({ packs: true, seed: 3 });
    world.packs = [readyPack(0, 0, "mine", DT * 2)];
    world.nextPackId = 1;
    world.nextSignalIn = null;
    world.ships[0] = { ...world.ships[0]!, pos: spotPos(0) };
    const { world: after, events } = run(world, DT);
    expect(after.ships[0]!.pilotPack).toBe("mine");
    expect(events.filter((e) => e.type === "packExpired")).toEqual([]);
  });

  it("gives the same expiries for the same seed", () => {
    const expiries = () => run(createWorld({ packs: true, seed: 11 }), 180).events.filter((e) => e.type === "packExpired");
    expect(expiries().length).toBeGreaterThan(2);
    expect(expiries()).toEqual(expiries());
  });
});

describe("freeSpots and signalPack", () => {
  it("skips spots holding a pack (glowing or not) and spots with a ship on them", () => {
    const world = createWorld({ packs: true, seed: 1 });
    world.packs = [readyPack(0, 1, "mine"), { id: 1, spot: 2, type: "emp", signalLeft: 2, lifeLeft: P.lifetime }];
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

describe("pickup and the two pack slots", () => {
  /** Ship 0 sitting on spot 0, which holds a ready pack of the given type. */
  function onPack(type: Pack["type"], ship: Partial<World["ships"][number]> = {}) {
    const world = createWorld({ packs: true, seed: 1 });
    world.packs = [readyPack(0, 0, type)];
    world.nextPackId = 1;
    world.nextSignalIn = null;
    world.ships[0] = { ...world.ships[0]!, pos: spotPos(0), ...ship };
    return world;
  }

  it("picks a pack up by sailing over it, into the slot of the role that uses it", () => {
    const { world, events } = run(onPack("torpedo"), DT);
    expect(world.ships[0]!.gunnerPack).toBe("torpedo");
    expect(world.ships[0]!.pilotPack).toBeNull();
    expect(world.packs).toEqual([]);
    expect(events).toContainEqual({ type: "packPickedUp", ship: 0, pack: 0, packType: "torpedo" });
    expect(run(onPack("emp"), DT).world.ships[0]!.gunnerPack).toBe("emp");
    const mine = run(onPack("mine"), DT).world.ships[0]!;
    expect(mine.pilotPack).toBe("mine");
    expect(mine.gunnerPack).toBeNull();
  });

  it("picks up on touch: centres closer than ship radius + pack radius", () => {
    const near = onPack("mine", { pos: { x: spotPos(0).x + reach - 1, y: spotPos(0).y } });
    expect(run(near, DT).world.ships[0]!.pilotPack).toBe("mine");
    const far = onPack("mine", { pos: { x: spotPos(0).x + reach + 1, y: spotPos(0).y } });
    expect(run(far, DT).world.ships[0]!.pilotPack).toBeNull();
  });

  it("can't pick up a pack while its role's slot is full; the pack stays", () => {
    const secondMine = run(onPack("mine", { pilotPack: "mine" }), DT);
    expect(secondMine.world.packs).toHaveLength(1);
    expect(secondMine.events.filter((e) => e.type === "packPickedUp")).toEqual([]);
    const empOnTorpedo = run(onPack("emp", { gunnerPack: "torpedo" }), DT).world;
    expect(empOnTorpedo.ships[0]!.gunnerPack).toBe("torpedo");
    expect(empOnTorpedo.packs).toHaveLength(1);
    const torpedoOnEmp = run(onPack("torpedo", { gunnerPack: "emp" }), DT).world;
    expect(torpedoOnEmp.ships[0]!.gunnerPack).toBe("emp");
    expect(torpedoOnEmp.packs).toHaveLength(1);
  });

  it("fills the other slot: one pack for the pilot and one for the gunner at once", () => {
    const torpedoOnMine = run(onPack("torpedo", { pilotPack: "mine" }), DT).world.ships[0]!;
    expect([torpedoOnMine.pilotPack, torpedoOnMine.gunnerPack]).toEqual(["mine", "torpedo"]);
    const mineOnEmp = run(onPack("mine", { gunnerPack: "emp" }), DT).world.ships[0]!;
    expect([mineOnEmp.pilotPack, mineOnEmp.gunnerPack]).toEqual(["mine", "emp"]);
  });

  it("can't pick up a pack that is still only glowing", () => {
    const world = onPack("mine");
    world.packs = [{ ...world.packs[0]!, signalLeft: 2 }];
    expect(run(world, DT).world.ships[0]!.pilotPack).toBeNull();
  });

  it("can pick up during respawn protection, but not while sunk", () => {
    expect(run(onPack("emp", { protection: 1.5 }), DT).world.ships[0]!.gunnerPack).toBe("emp");
    expect(run(onPack("emp", { sunk: true, respawnIn: 2 }), DT).world.packs).toHaveLength(1);
  });

  it("each role's Pack button uses only its own slot", () => {
    const world = createWorld({ packs: true, seed: 1 });
    world.nextSignalIn = null;
    world.ships[0] = { ...world.ships[0]!, pos: { x: 400, y: 300 }, heading: 0, pilotPack: "mine", gunnerPack: "torpedo" };
    const press = (pilot: boolean, gunner: boolean): ShipInput => ({
      pilot: { steer: { x: 0, y: 0 }, boost: false, pack: pilot },
      gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false, pack: gunner },
    });
    const pilotOnly = run(world, DT, () => [press(true, false)]);
    expect([pilotOnly.world.ships[0]!.pilotPack, pilotOnly.world.ships[0]!.gunnerPack]).toEqual([null, "torpedo"]);
    expect(pilotOnly.world.mines).toHaveLength(1);
    const gunnerOnly = run(world, DT, () => [press(false, true)]);
    expect([gunnerOnly.world.ships[0]!.pilotPack, gunnerOnly.world.ships[0]!.gunnerPack]).toEqual(["mine", null]);
    expect(gunnerOnly.world.torpedoes).toHaveLength(1);
    const both = run(world, DT, () => [press(true, true)]);
    expect(both.events.filter((e) => e.type === "packUsed").map((e) => e.type === "packUsed" && e.packType)).toEqual(["mine", "torpedo"]);
  });

  it("loses both held packs when the ship sinks, one packLost each", () => {
    const world = createWorld({ packs: true, seed: 1 });
    world.nextSignalIn = null;
    world.ships[0] = { ...world.ships[0]!, pos: { x: 400, y: 200 }, heading: 0, turret: 0 };
    world.ships[1] = { ...world.ships[1]!, pos: { x: 600, y: 200 }, health: 20, pilotPack: "mine", gunnerPack: "torpedo" };
    const fire: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } };
    const { world: after, events } = run(world, 1, () => [fire]);
    expect(after.ships[1]!.pilotPack).toBeNull();
    expect(after.ships[1]!.gunnerPack).toBeNull();
    expect(events.filter((e) => e.type === "packLost")).toEqual([
      { type: "packLost", ship: 1, packType: "mine" },
      { type: "packLost", ship: 1, packType: "torpedo" },
    ]);
  });
});

describe("health pack", () => {
  function hurtOnHealth(health: number, gunnerPack: Pack["type"] | null = null) {
    const world = createWorld({ packs: true, seed: 1 });
    world.packs = [readyPack(0, 0, "health")];
    world.nextPackId = 1;
    world.nextSignalIn = null;
    world.ships[0] = { ...world.ships[0]!, pos: spotPos(0), health, pilotPack: gunnerPack ? "mine" : null, gunnerPack };
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

  it("doesn't use a slot: taken with both slots full, and both packs stay", () => {
    const { world } = run(hurtOnHealth(50, "torpedo"), DT);
    expect([world.ships[0]!.pilotPack, world.ships[0]!.gunnerPack]).toEqual(["mine", "torpedo"]);
    expect(world.packs).toEqual([]);
  });

  it("isn't taken by a ship at full health", () => {
    const { world, events } = run(hurtOnHealth(max), DT);
    expect(world.packs).toHaveLength(1);
    expect(events.filter((e) => e.type === "packPickedUp")).toEqual([]);
  });
});
