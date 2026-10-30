import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, closestPointOnSegment, pointInPolygon, type Polygon } from "./geometry.ts";
import { LAYOUTS, LAYOUT_IDS } from "./layouts.ts";
import { SPAWN_POINTS } from "./map.ts";
import { DEFAULT_SEA, inSea, packLimit, parseSeaSize, seaCentre, seaFor, seaScale, type Sea } from "./sea.ts";
import { PACK_FROM_ISLANDS, PACK_FROM_REEFS, seaReefs, seaShipCounts, seaSpots, spreadLayout } from "./seaLayout.ts";
import { SEA_SPOT_TABLE } from "./seaSpotTable.ts";
import { SHIP_TYPES } from "./shipTypes.ts";
import { distance, type Vec } from "./vec.ts";
import { wreckHull } from "./wrecks.ts";

// Stage 5 slice 5: the sea by number of ships, and today's layouts spread out to fit the bigger seas, held to the
// agreed checks (approved 2026-10-30).

const BIG: readonly Sea[] = TUNING.seaSizes.slice(1).map((s) => ({ width: s.width, height: s.height }));
const BIGGEST = Math.max(...SHIP_TYPES.map((t) => TUNING.shipTypes[t].radius));
const R = TUNING.ship.radius;
const MIN_CHANNEL = 70;
const OPEN_WATER = 95;
const middleOf = (poly: Polygon): Vec => ({ x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length });
const touches = (p: Vec, r: number, poly: Polygon) => pointInPolygon(p, poly) || circleOverlapsPolygon(p, r, poly) !== null;
const toShore = (p: Vec, islands: readonly Polygon[]) =>
  Math.min(...islands.flatMap((island) => island.map((a, i) => distance(p, closestPointOnSegment(p, a, island[(i + 1) % island.length]!)))));
function gap(a: Polygon, b: Polygon): number {
  const edges = (poly: Polygon) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]!] as const);
  let best = Infinity;
  for (const p of a) for (const [s, e] of edges(b)) best = Math.min(best, distance(p, closestPointOnSegment(p, s, e)));
  for (const p of b) for (const [s, e] of edges(a)) best = Math.min(best, distance(p, closestPointOnSegment(p, s, e)));
  return best;
}

/** Cells a ship's centre can reach from `from` (a grid over the sea), as in layouts.test.ts. */
function reachable(sea: Sea, solids: readonly Polygon[], from: Vec, r: number): (p: Vec) => boolean {
  const step = 12;
  const cols = Math.floor(sea.width / step);
  const rows = Math.floor(sea.height / step);
  // Each solid's box grown by the ship's size: only those whose box holds the cell are checked (much faster).
  const boxes = solids.map((s) => ({
    s, x0: Math.min(...s.map((p) => p.x)) - r, x1: Math.max(...s.map((p) => p.x)) + r, y0: Math.min(...s.map((p) => p.y)) - r, y1: Math.max(...s.map((p) => p.y)) + r,
  }));
  const free = (c: number, w: number) => {
    const p = { x: (c + 0.5) * step, y: (w + 0.5) * step };
    return inSea(p, sea, r) && boxes.every((b) => p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1 || circleOverlapsPolygon(p, r, b.s) === null);
  };
  const seen = new Uint8Array(cols * rows);
  const start = [Math.floor(from.x / step), Math.floor(from.y / step)] as const;
  const queue: (readonly [number, number])[] = [start];
  seen[start[1] * cols + start[0]] = 1;
  while (queue.length) {
    const [c, w] = queue.pop()!;
    for (const [dc, dw] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nw = w + dw;
      if (nc < 0 || nw < 0 || nc >= cols || nw >= rows || seen[nw * cols + nc] || !free(nc, nw)) continue;
      seen[nw * cols + nc] = 1;
      queue.push([nc, nw]);
    }
  }
  // A spot counts as reached when its cell or a neighbour is (a spot can sit near a cell's edge).
  return (p) => {
    const c = Math.floor(p.x / step);
    const w = Math.floor(p.y / step);
    return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dw]) => seen[(w + dw!) * cols + c + dc!] === 1);
  };
}

describe("the sea by number of ships (Stage 5)", () => {
  it("is today's sea for 2–4 ships, 3200 × 1800 for 5–7 and 4000 × 2250 for 8–10", () => {
    for (const n of [2, 3, 4]) expect(seaFor(n)).toEqual(DEFAULT_SEA);
    for (const n of [5, 6, 7]) expect(seaFor(n)).toEqual({ width: 3200, height: 1800 });
    for (const n of [8, 9, 10]) expect(seaFor(n)).toEqual({ width: 4000, height: 2250 });
    expect(seaScale(seaFor(10))).toBe(2.5);
    expect(seaCentre(seaFor(5))).toEqual({ x: 1600, y: 900 });
  });

  it("the test-only SEA_SIZE names one of the agreed sizes", () => {
    expect(parseSeaSize("3200x1800")).toEqual({ width: 3200, height: 1800 });
    expect(parseSeaSize("4000x2250")).toEqual({ width: 4000, height: 2250 });
    for (const text of [undefined, "", "1000x1000", "3200", "3200 x 1800"]) expect(parseSeaSize(text)).toBeNull();
  });

  it("packs on the map at once: one for every two ships, at least 2", () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10].map(packLimit)).toEqual([2, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
});

describe("layouts on today's sea (Stage 5)", () => {
  it("are exactly the layout's own", () => {
    for (const id of LAYOUT_IDS) {
      const l = spreadLayout(id, DEFAULT_SEA);
      expect(l.islands).toBe(LAYOUTS[id].islands);
      expect(l.wrecks).toBe(LAYOUTS[id].wrecks);
      expect(seaSpots(id, DEFAULT_SEA, 2)).toEqual({ starts: LAYOUTS[id].starts, packSpots: LAYOUTS[id].packSpots, respawns: SPAWN_POINTS });
      expect(seaSpots(id, DEFAULT_SEA, 3)).toEqual({ starts: LAYOUTS[id].starts3, packSpots: LAYOUTS[id].packSpots3, respawns: SPAWN_POINTS });
    }
  });
});

for (const sea of BIG) {
  describe(`layouts on the ${sea.width} × ${sea.height} sea (Stage 5)`, () => {
    const k = seaScale(sea);
    it("spread out from the middle: every island, reef and wreck keeps its shape and size", () => {
      for (const id of LAYOUT_IDS) {
        const l = spreadLayout(id, sea);
        const pairs: [Polygon, Polygon][] = [...LAYOUTS[id].islands.map((p, i) => [p, l.islands[i]!] as [Polygon, Polygon]), ...LAYOUTS[id].reefs.map((p, i) => [p, l.reefs[i]!] as [Polygon, Polygon])];
        for (const [before, after] of pairs) {
          const m0 = middleOf(before);
          const m1 = middleOf(after);
          expect(m1.x - sea.width / 2).toBeCloseTo((m0.x - 800) * k, 6);
          expect(m1.y - sea.height / 2).toBeCloseTo((m0.y - 450) * k, 6);
          before.forEach((p, i) => {
            expect(after[i]!.x - m1.x).toBeCloseTo(p.x - m0.x, 6);
            expect(after[i]!.y - m1.y).toBeCloseTo(p.y - m0.y, 6);
          });
        }
        LAYOUTS[id].wrecks.forEach((w, i) => expect(l.wrecks[i]!.angle).toBe(w.angle));
        for (const reef of l.fewReefs) expect(l.reefs).toContain(reef);
        expect(seaReefs(id, sea, "none")).toEqual([]);
        expect(seaReefs(id, sea, "few")).toBe(l.fewReefs);
      }
    });

    it(`leaves every channel at least ${MIN_CHANNEL} wide, between islands and wrecks and to the sea edge`, () => {
      for (const id of LAYOUT_IDS) {
        const l = spreadLayout(id, sea);
        const solids = [...l.islands, ...l.wrecks.map(wreckHull)];
        for (let i = 0; i < solids.length; i++) {
          expect(Math.min(...solids[i]!.flatMap((p) => [p.x, sea.width - p.x, p.y, sea.height - p.y]))).toBeGreaterThanOrEqual(MIN_CHANNEL);
          for (let j = i + 1; j < solids.length; j++) expect(gap(solids[i]!, solids[j]!), `${id} ${i} ${j}`).toBeGreaterThanOrEqual(MIN_CHANNEL);
        }
      }
    });

    for (const id of LAYOUT_IDS) {
      describe(id, () => {
        const l = spreadLayout(id, sea);
        const solids = [...l.islands, ...l.wrecks.map(wreckHull)];
        const reefsAndWrecks = [...l.reefs, ...l.wrecks.map(wreckHull)];
        for (const ships of seaShipCounts(sea)) {
          it(`${ships} ships: starts round a ring, every spot clear, fair and reachable by every type`, () => {
            expect(SEA_SPOT_TABLE[`${id}:${sea.width}x${sea.height}:${ships}`], "the table holds it").toBeDefined();
            const { starts, packSpots, respawns } = seaSpots(id, sea, ships);
            expect(starts).toHaveLength(ships);
            expect(packSpots).toHaveLength(2 * ships);
            // Evenly round a ring around the middle.
            const c = seaCentre(sea);
            const radii = starts.map((p) => distance(p, c));
            for (const r of radii) expect(r).toBeCloseTo(radii[0]!, 0);
            for (let i = 0; i < ships; i++) expect(distance(starts[i]!, starts[(i + 1) % ships]!)).toBeCloseTo(distance(starts[0]!, starts[1 % ships]!), 0);
            // Starts: the biggest ship's size from the edge, three from islands, open water, a ship's room from reefs and wrecks.
            for (const p of starts) {
              expect(inSea(p, sea, BIGGEST), JSON.stringify(p)).toBe(true);
              expect(l.islands.every((island) => !touches(p, 3 * BIGGEST, island)), JSON.stringify(p)).toBe(true);
              expect(toShore(p, l.islands)).toBeGreaterThanOrEqual(OPEN_WATER);
              expect(reefsAndWrecks.every((s) => !touches(p, 2 * R + 12, s)), JSON.stringify(p)).toBe(true);
            }
            // Pack spots: 60 from the edge, 45 from islands, 55 from reefs and wrecks, over 200 from starts and respawn spots, 100 apart.
            for (const p of packSpots) {
              expect(inSea(p, sea, 60), JSON.stringify(p)).toBe(true);
              expect(l.islands.every((island) => !touches(p, PACK_FROM_ISLANDS, island)), JSON.stringify(p)).toBe(true);
              expect(reefsAndWrecks.every((s) => !touches(p, PACK_FROM_REEFS, s)), JSON.stringify(p)).toBe(true);
              for (const q of [...starts, ...respawns]) expect(distance(p, q)).toBeGreaterThan(200);
            }
            for (let i = 0; i < packSpots.length; i++) for (let j = i + 1; j < packSpots.length; j++) expect(distance(packSpots[i]!, packSpots[j]!)).toBeGreaterThan(100);
            // Equal distance from every start to its nearest packs.
            const nearest = starts.map((s) => {
              const [a, b] = packSpots.map((p) => distance(s, p)).sort((x, y) => x - y);
              return (a! + b!) / 2;
            });
            for (const d of nearest) expect(d).toBeCloseTo(nearest[0]!, 0);
            // At least 4 respawn spots, each with room for the biggest ship.
            expect(respawns.length).toBeGreaterThanOrEqual(4);
            for (const p of respawns) {
              expect(inSea(p, sea, BIGGEST)).toBe(true);
              expect(l.islands.every((island) => !touches(p, 3 * BIGGEST, island)), JSON.stringify(p)).toBe(true);
            }
          });
        }
        it("every ship type can sail from a start to every start, pack spot and respawn spot, with every wreck standing", () => {
          for (const type of SHIP_TYPES) {
            const counts = seaShipCounts(sea);
            const canReach = reachable(sea, solids, seaSpots(id, sea, counts[0]!).starts[0]!, TUNING.shipTypes[type].radius);
            for (const ships of counts) {
              const { starts, packSpots, respawns } = seaSpots(id, sea, ships);
              for (const p of [...starts, ...packSpots, ...respawns]) expect(canReach(p), `${type} ${ships} ${JSON.stringify(p)}`).toBe(true);
            }
          }
        });
      });
    }
  });
}
