import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, closestPointOnSegment, pointInPolygon, type Polygon } from "./geometry.ts";
import { DEFAULT_LAYOUT, LAYOUTS, LAYOUT_IDS, randomLayout, type Layout } from "./layouts.ts";
import { createWorld } from "./match.ts";
import { step } from "./step.ts";
import type { ShipInput } from "./types.ts";
import { ISLAND, PACK_SPOTS, PACK_SPOTS_3, SPAWN_POINTS, START_POINTS, START_POINTS_3 } from "./map.ts";
import { distance, type Vec } from "./vec.ts";

const { width: W, height: H } = TUNING.sea;
const R = TUNING.ship.radius;
/** The narrowest channel: a Frigate (56 across) with a little room. */
const MIN_CHANNEL = 70;
/** Pack spots sit this far from any island, so a ship can sail onto them. */
const PACK_CLEARANCE = 60;
/** 3-ship starts sit at least this far from any shore. */
const OPEN_WATER = 95;

const all = LAYOUT_IDS.map((id) => LAYOUTS[id]);
const near = (a: Vec, b: Vec) => distance(a, b) < 0.01;
const sameSpots = (a: readonly Vec[], b: readonly Vec[]) => a.length === b.length && a.every((p) => b.some((q) => near(p, q)));
const mirrorX = (p: Vec): Vec => ({ x: W - p.x, y: p.y });
const mirrorY = (p: Vec): Vec => ({ x: p.x, y: H - p.y });
const clearOf = (p: Vec, r: number, islands: readonly Polygon[]) => islands.every((island) => circleOverlapsPolygon(p, r, island) === null);

function islandGap(a: Polygon, b: Polygon): number {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return 0;
  let best = Infinity;
  for (const [from, to] of [[a, b], [b, a]] as const) {
    for (const p of from) {
      for (let i = 0; i < to.length; i++) best = Math.min(best, distance(p, closestPointOnSegment(p, to[i]!, to[(i + 1) % to.length]!)));
    }
  }
  return best;
}

const edgeGap = (island: Polygon) => Math.min(...island.flatMap((p) => [p.x, W - p.x, p.y, H - p.y]));

/** Distance from a point to the nearest island's shore. */
const toShore = (p: Vec, islands: readonly Polygon[]) =>
  Math.min(...islands.flatMap((island) => island.map((a, i) => distance(p, closestPointOnSegment(p, a, island[(i + 1) % island.length]!)))));

/** Cells a Frigate's centre can be in (a grid over the sea), and which of them it can reach from `from`. */
function reachable(islands: readonly Polygon[], from: Vec): (p: Vec) => boolean {
  const step = 8;
  const cols = Math.floor(W / step);
  const rows = Math.floor(H / step);
  const centre = (c: number, r: number): Vec => ({ x: (c + 0.5) * step, y: (r + 0.5) * step });
  const free = (c: number, r: number) => {
    const p = centre(c, r);
    return p.x >= R && p.x <= W - R && p.y >= R && p.y <= H - R && clearOf(p, R, islands);
  };
  const seen = new Uint8Array(cols * rows);
  const start = [Math.floor(from.x / step), Math.floor(from.y / step)] as const;
  const queue: (readonly [number, number])[] = [start];
  seen[start[1] * cols + start[0]] = 1;
  while (queue.length) {
    const [c, r] = queue.pop()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[nr * cols + nc] || !free(nc, nr)) continue;
      seen[nr * cols + nc] = 1;
      queue.push([nc, nr]);
    }
  }
  return (p) => seen[Math.floor(p.y / step) * cols + Math.floor(p.x / step)] === 1;
}

const spread = (values: readonly number[]) => Math.max(...values) / Math.min(...values);

describe("island layouts", () => {
  it("are the nine agreed layouts, with One Island (today's map) the default", () => {
    expect(all.map((l) => l.name)).toEqual(["One Island", "Twin Isles", "The Strait", "Four Rocks", "Crossroads", "The Wall", "The Ring", "Archipelago", "Slalom"]);
    expect(DEFAULT_LAYOUT).toBe("oneIsland");
    for (const l of all) expect(LAYOUTS[l.id]).toBe(l);
  });

  it("One Island is exactly today's map", () => {
    const one = LAYOUTS.oneIsland;
    expect(one.islands).toEqual([ISLAND]);
    expect([one.starts, one.packSpots, one.starts3, one.packSpots3]).toEqual([START_POINTS, PACK_SPOTS, START_POINTS_3, PACK_SPOTS_3]);
  });

  it("have 1–4 islands, or many small rocks (The Ring's 6, Archipelago and Slalom)", () => {
    const manyRocks = ["ring", "archipelago", "slalom"];
    for (const l of all) expect(l.islands.length).toBeGreaterThanOrEqual(1);
    for (const l of all.filter((l) => !manyRocks.includes(l.id))) expect(l.islands.length).toBeLessThanOrEqual(4);
    expect(LAYOUTS.ring.islands).toHaveLength(6);
    expect(LAYOUTS.archipelago.islands.length).toBeGreaterThanOrEqual(15);
    expect(LAYOUTS.slalom.islands.length).toBeGreaterThanOrEqual(15);
  });
});

describe.each(all.map((l) => [l.name, l] as [string, Layout]))("%s", (_name, l) => {
  it.skipIf(l.id === "oneIsland")("is a mirror image left↔right and top↕bottom (islands, 2-ship starts and pack spots)", () => {
    for (const mirror of [mirrorX, mirrorY]) {
      for (const island of l.islands) expect(l.islands.some((other) => sameSpots(island.map(mirror), other)), `${JSON.stringify(island[0])}`).toBe(true);
      expect(sameSpots(l.packSpots.map(mirror), l.packSpots)).toBe(true);
    }
    expect(near(mirrorX(l.starts[0]!), l.starts[1]!)).toBe(true);
  });

  it("keeps starts and the corner respawn spots in the sea and clear of the islands", () => {
    for (const p of [...l.starts, ...l.starts3, ...SPAWN_POINTS]) {
      expect(p.x >= R && p.x <= W - R && p.y >= R && p.y <= H - R, JSON.stringify(p)).toBe(true);
      expect(clearOf(p, R * 3, l.islands), JSON.stringify(p)).toBe(true);
    }
  });

  it(`puts pack spots in open water (${PACK_CLEARANCE} from islands), over 200 from starts and respawn spots`, () => {
    for (const [spots, starts] of [[l.packSpots, l.starts], [l.packSpots3, l.starts3]] as const) {
      for (const spot of spots) {
        expect(spot.x >= PACK_CLEARANCE && spot.x <= W - PACK_CLEARANCE && spot.y >= PACK_CLEARANCE && spot.y <= H - PACK_CLEARANCE, JSON.stringify(spot)).toBe(true);
        expect(clearOf(spot, PACK_CLEARANCE, l.islands), JSON.stringify(spot)).toBe(true);
        for (const p of [...SPAWN_POINTS, ...starts]) expect(distance(spot, p), `${JSON.stringify(spot)} vs ${JSON.stringify(p)}`).toBeGreaterThan(200);
      }
      // No two spots on top of each other.
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(distance(spots[i]!, spots[j]!)).toBeGreaterThan(100);
    }
  });

  it("has reefs (Stage 2 slice 3): mirrored both ways, clear of every spot and of the islands; Few is part of All", () => {
    expect(l.reefs.length).toBeGreaterThanOrEqual(2);
    expect(l.fewReefs.length).toBeGreaterThanOrEqual(1);
    for (const reef of l.fewReefs) expect(l.reefs).toContain(reef);
    for (const mirror of [mirrorX, mirrorY]) {
      for (const reef of l.reefs) expect(l.reefs.some((other) => sameSpots(reef.map(mirror), other))).toBe(true);
    }
    const spots = [...l.starts, ...l.starts3, ...SPAWN_POINTS, ...l.packSpots, ...l.packSpots3];
    for (const reef of l.reefs) {
      for (const spot of spots) {
        expect(pointInPolygon(spot, reef) || circleOverlapsPolygon(spot, 2 * R + 12, reef) !== null, JSON.stringify(spot)).toBe(false);
      }
      for (const island of l.islands) expect(islandGap(reef, island)).toBeGreaterThan(0);
      expect(reef.every((p) => p.x > 0 && p.x < W && p.y > 0 && p.y < H)).toBe(true);
    }
  });

  it("Few reefs look the same from either 2-ship start (each mirrored through the middle)", () => {
    const throughMiddle = (p: Vec): Vec => ({ x: W - p.x, y: H - p.y });
    for (const reef of l.fewReefs) expect(l.fewReefs.some((other) => sameSpots(reef.map(throughMiddle), other))).toBe(true);
  });

  it(`leaves every channel at least ${MIN_CHANNEL} wide, between islands and to the sea edge`, () => {
    for (let i = 0; i < l.islands.length; i++) {
      expect(edgeGap(l.islands[i]!), `island ${i} to the edge`).toBeGreaterThanOrEqual(MIN_CHANNEL);
      for (let j = i + 1; j < l.islands.length; j++) expect(islandGap(l.islands[i]!, l.islands[j]!), `islands ${i} and ${j}`).toBeGreaterThanOrEqual(MIN_CHANNEL);
    }
  });

  it("lets a Frigate sail from a start to every start, pack spot and respawn spot", () => {
    const canReach = reachable(l.islands, l.starts[0]!);
    for (const p of [...l.starts, ...l.starts3, ...l.packSpots, ...l.packSpots3, ...SPAWN_POINTS]) expect(canReach(p), JSON.stringify(p)).toBe(true);
  });

  it("3-ship spots are roughly fair: starts equally far apart (over gun range) and near packs (within 15%), in open water", () => {
    const [a, b, c] = l.starts3 as [Vec, Vec, Vec];
    const sides = [distance(a, b), distance(b, c), distance(c, a)];
    expect(Math.min(...sides)).toBeGreaterThan(TUNING.gun.shotRange);
    expect(spread(sides)).toBeLessThanOrEqual(1.15);
    const nearestPacks = l.starts3.map((s) => {
      const [first, second] = l.packSpots3.map((p) => distance(s, p)).sort((x, y) => x - y);
      return (first! + second!) / 2;
    });
    expect(spread(nearestPacks), JSON.stringify(nearestPacks)).toBeLessThanOrEqual(1.15);
    for (const s of l.starts3) expect(toShore(s, l.islands), JSON.stringify(s)).toBeGreaterThanOrEqual(OPEN_WATER);
  });
});

describe("Random", () => {
  it("picks with the seed: the same seed gives the same layout", () => {
    for (const seed of [1, 367, 8, 123456]) expect(randomLayout(seed, null)).toBe(randomLayout(seed, null));
    const picked = new Set(Array.from({ length: 200 }, (_, seed) => randomLayout(seed, null)));
    expect([...picked].sort()).toEqual([...LAYOUT_IDS].sort());
  });

  it("never picks the previous match's layout", () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const previous of LAYOUT_IDS) expect(randomLayout(seed, previous)).not.toBe(previous);
    }
  });
});

describe("a match on a layout", () => {
  const DT = 0.05;
  const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };

  it("starts ships at the layout's spots, with its islands and pack spots (One Island by default)", () => {
    expect(createWorld().layout).toBe("oneIsland");
    expect(createWorld().islands).toEqual([ISLAND]);
    const world = createWorld({ layout: "slalom" });
    expect(world.islands).toBe(LAYOUTS.slalom.islands);
    expect(world.packSpots).toBe(LAYOUTS.slalom.packSpots);
    expect(world.ships.map((s) => s.pos)).toEqual(LAYOUTS.slalom.starts);
    const three = createWorld({ layout: "wall", ships: 3 });
    expect(three.ships.map((s) => s.pos)).toEqual(LAYOUTS.wall.starts3);
    expect(three.packSpots).toBe(LAYOUTS.wall.packSpots3);
  });

  it("its rocks stop ships and shots", () => {
    // The Wall's island stands between the starts: ship 0 sails east into it and is held back; a shot east stops at it.
    let world = createWorld({ layout: "wall" });
    world.ships[0] = { ...world.ships[0]!, pos: { x: 650, y: 450 }, heading: 0, turret: 0 };
    world.ships[1] = { ...world.ships[1]!, pos: { x: 950, y: 450 } };
    const east: ShipInput = { pilot: { steer: { x: 1, y: 0 }, boost: false }, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } };
    const events = [];
    for (let i = 0; i < 60; i++) {
      const r = step(world, [east, idle], DT);
      world = r.world;
      events.push(...r.events);
    }
    expect(world.ships[0]!.pos.x).toBeLessThan(800 - 70);
    for (const island of world.islands) expect(circleOverlapsPolygon(world.ships[0]!.pos, R - 0.5, island)).toBeNull();
    expect(events.filter((e) => e.type === "hit")).toEqual([]);
    expect(events.some((e) => e.type === "shotFired")).toBe(true);
  });

  it("a mine can't be dropped into a rock", () => {
    // Slalom: ship 0 just east of a rock at (330, 225), facing east, so its stern is against the rock.
    const world = createWorld({ layout: "slalom", packs: true });
    world.ships[0] = { ...world.ships[0]!, pos: { x: 330 + 30 + R + 4, y: 225 }, heading: 0, pilotPack: "mine" };
    const drop: ShipInput = { ...idle, pilot: { ...idle.pilot, pack: true } };
    const after = step(world, [drop, idle], DT);
    expect(after.world.mines).toEqual([]);
    expect(after.world.ships[0]!.pilotPack).toBe("mine");
  });
});
