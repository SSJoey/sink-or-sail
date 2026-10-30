import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, pointInPolygon, type Polygon } from "./geometry.ts";
import { LAYOUTS, reefsFor, type LayoutId, type ReefAmount } from "./layouts.ts";
import { SPAWN_POINTS } from "./map.ts";
import { DEFAULT_SEA, inSea, seaCentre, seaScale, startRing, type Sea } from "./sea.ts";
import { SHIP_TYPES } from "./shipTypes.ts";
import { add, distance, scale, sub, type Vec } from "./vec.ts";
import { wreckHull, type WreckSpot } from "./wrecks.ts";
import { SEA_SPOT_TABLE } from "./seaSpotTable.ts";

// Stage 5 slice 5 (approved 2026-10-30): on a bigger sea, today's layouts are spread out from the middle by the
// sea's scale; every island, reef and wreck keeps its own size and shape. The starts go evenly round a ring around
// the middle, with two pack spots per ship, and the respawn spots are today's corners plus the middle of each edge.
// On today's sea everything is the layout's own (so today's matches are unchanged).

/** A layout on a sea: its islands, reefs (All and Few) and wrecks where they are on that sea. */
export interface SpreadLayout {
  islands: readonly Polygon[];
  reefs: readonly Polygon[];
  fewReefs: readonly Polygon[];
  wrecks: readonly WreckSpot[];
}

/** Room kept round the spots on a bigger sea, as the layout checks ask (`layouts.test.ts`). */
const BIGGEST = Math.max(...SHIP_TYPES.map((t) => TUNING.shipTypes[t].radius));
/** Starts and respawn spots: three of the biggest ship's sizes from islands; ships' room from reefs and wrecks. */
const SPOT_FROM_ISLANDS = 3 * BIGGEST;
const SPOT_FROM_REEFS = 2 * TUNING.ship.radius + 12;
/**
 * Pack spots: `PACK_FROM_EDGE` from the sea edge, over `PACK_FROM_SPOTS` from starts and respawn spots; on a bigger
 * sea `PACK_FROM_ISLANDS` from islands and `PACK_FROM_REEFS` from reefs and wrecks (approved 2026-10-30; today's
 * layouts keep 60 and a ship's room).
 */
const PACK_FROM_EDGE = 60;
export const PACK_FROM_ISLANDS = 45;
export const PACK_FROM_REEFS = 55;
const PACK_FROM_SPOTS = 200;
/** Today's middle-of-edge spots (with SPAWN_POINTS' corners), spread like everything else on a bigger sea. */
const EDGE_SPOTS: readonly Vec[] = [
  { x: DEFAULT_SEA.width / 2, y: 180 },
  { x: DEFAULT_SEA.width / 2, y: DEFAULT_SEA.height - 180 },
  { x: 200, y: DEFAULT_SEA.height / 2 },
  { x: DEFAULT_SEA.width - 200, y: DEFAULT_SEA.height / 2 },
];

const isDefault = (sea: Sea) => sea.width === DEFAULT_SEA.width && sea.height === DEFAULT_SEA.height;
const key = (sea: Sea) => `${sea.width}x${sea.height}`;

/** A point of today's sea moved out from the middle by the bigger sea's scale. */
function spreadPoint(p: Vec, sea: Sea): Vec {
  return add(seaCentre(sea), scale(sub(p, seaCentre(DEFAULT_SEA)), seaScale(sea)));
}

/** A polygon moved so its middle is spread like a point; its shape and size stay. */
function spreadPolygon(poly: Polygon, sea: Sea): Polygon {
  const middle = { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  const shift = sub(spreadPoint(middle, sea), middle);
  return poly.map((p) => add(p, shift));
}

const spreadCache = new Map<string, SpreadLayout>();

/** The layout on `sea`: on today's sea exactly the layout's own; on a bigger one spread out from the middle. */
export function spreadLayout(id: LayoutId, sea: Sea): SpreadLayout {
  const layout = LAYOUTS[id];
  if (isDefault(sea)) return { islands: layout.islands, reefs: layout.reefs, fewReefs: layout.fewReefs, wrecks: layout.wrecks };
  const k = `${id}:${key(sea)}`;
  const cached = spreadCache.get(k);
  if (cached) return cached;
  // Few is a part of All: the same spread polygons, so Few's reefs are still among All's.
  const reefs = new Map(layout.reefs.map((reef) => [reef, spreadPolygon(reef, sea)]));
  const spread: SpreadLayout = {
    islands: layout.islands.map((island) => spreadPolygon(island, sea)),
    reefs: layout.reefs.map((reef) => reefs.get(reef)!),
    fewReefs: layout.fewReefs.map((reef) => reefs.get(reef) ?? spreadPolygon(reef, sea)),
    wrecks: layout.wrecks.map((w) => ({ pos: spreadPoint(w.pos, sea), angle: w.angle })),
  };
  spreadCache.set(k, spread);
  return spread;
}

/** The reefs a match has: None, Few or All of the layout's, on its sea. */
export function seaReefs(id: LayoutId, sea: Sea, amount: ReefAmount): readonly Polygon[] {
  if (isDefault(sea)) return reefsFor(id, amount);
  if (amount === "none") return [];
  const spread = spreadLayout(id, sea);
  return amount === "few" ? spread.fewReefs : spread.reefs;
}

/** Everything a spot keeps away from: islands (and how far), reefs and wreck hulls. */
function clearOf(p: Vec, fromIslands: number, l: SpreadLayout, fromReefs = SPOT_FROM_REEFS): boolean {
  const solid = (poly: Polygon, r: number) => pointInPolygon(p, poly) || circleOverlapsPolygon(p, r, poly) !== null;
  return !l.islands.some((island) => solid(island, fromIslands))
    && !l.reefs.some((reef) => solid(reef, fromReefs))
    && !l.wrecks.map(wreckHull).some((hull) => solid(hull, fromReefs));
}

/** At least this many respawn spots on a bigger sea. */
const MIN_RESPAWNS = 4;

/**
 * The respawn spots a bigger sea can have: today's four corners and the middle of each edge, spread out, leaving out
 * any too close to an island, reef or wreck (each match then leaves out any too close to its pack spots).
 */
function respawnCandidates(l: SpreadLayout, sea: Sea): Vec[] {
  return [...SPAWN_POINTS, ...EDGE_SPOTS].map((p) => spreadPoint(p, sea)).filter((p) => inSea(p, sea, BIGGEST) && clearOf(p, SPOT_FROM_ISLANDS, l));
}

/** A point `r` from the middle of the sea, at `degrees` (0 = east, 90 = south, as on screen). */
const around = (sea: Sea, degrees: number, r: number): Vec => {
  const c = seaCentre(sea);
  return { x: c.x + r * Math.cos((degrees * Math.PI) / 180), y: c.y + r * Math.sin((degrees * Math.PI) / 180) };
};

/** A ring of `ships` starts turned by `turn` degrees (Crew 1 west of the middle when 0), and its pack spots. */
function ringSpots(sea: Sea, ring: number, ships: number, turn: number, inner = 0.5, outer = 1): { starts: Vec[]; packSpots: Vec[] } {
  const step = 360 / ships;
  const starts = Array.from({ length: ships }, (_, i) => around(sea, 180 + turn + i * step, ring));
  // Two per ship: halfway between each pair of neighbouring starts on the ring, and halfway in from each start.
  const between = Array.from({ length: ships }, (_, i) => around(sea, 180 + turn + (i + 0.5) * step, ring * outer));
  const inward = Array.from({ length: ships }, (_, i) => around(sea, 180 + turn + i * step, ring * inner));
  return { starts, packSpots: [...between, ...inward] };
}

const RING_SEARCH = 300;
const INNER = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65];
const OUTER = [1, 0.9, 1.1, 0.8];

/** A match's starts (by ship id), pack spots and respawn spots. */
export interface SeaSpots {
  starts: readonly Vec[];
  packSpots: readonly Vec[];
  respawns: readonly Vec[];
}

const spotsCache = new Map<string, SeaSpots>();

/**
 * The ship counts a bigger sea is made for (those that pick it), plus 2 and 3 for the test-only `SEA_SIZE` setting:
 * the counts the table holds.
 */
export function seaShipCounts(sea: Sea): number[] {
  const sizes = TUNING.seaSizes;
  const i = sizes.findIndex((s) => s.width === sea.width && s.height === sea.height);
  if (i <= 0) return [];
  const from = sizes[i - 1]!.upTo + 1;
  const counts = Array.from({ length: sizes[i]!.upTo - from + 1 }, (_, k) => from + k);
  return [...new Set([2, 3, ...counts])];
}

/** The corner respawn spots in order round the sea: top left, top right, bottom right, bottom left. */
const FOUR_STARTS: readonly Vec[] = [SPAWN_POINTS[0]!, SPAWN_POINTS[1]!, SPAWN_POINTS[3]!, SPAWN_POINTS[2]!];

const toVecs = (points: readonly (readonly [number, number])[]): Vec[] => points.map(([x, y]) => ({ x, y }));

/**
 * Where a match's ships start, its packs can appear and its sunk ships come back. Today's sea: the layout's
 * hand-placed 2- or 3-ship spots (4 ships: the corners) and the four corners. A bigger sea: looked up in the table worked out by
 * `scripts/seaSpotTable.ts` (see searchSeaSpots), or worked out now for a count the table doesn't hold.
 */
export function seaSpots(id: LayoutId, sea: Sea, ships: number): SeaSpots {
  if (startRing(sea) === null) {
    const layout = LAYOUTS[id];
    // Stage 5: four ships start in the four corner respawn spots (round the sea from the top left), with the
    // layout's 2-ship pack spots, which are the same distance from every corner (approved 2026-10-30).
    if (ships === 4) return { starts: FOUR_STARTS, packSpots: layout.packSpots, respawns: SPAWN_POINTS };
    return ships === 3
      ? { starts: layout.starts3, packSpots: layout.packSpots3, respawns: SPAWN_POINTS }
      : { starts: layout.starts, packSpots: layout.packSpots, respawns: SPAWN_POINTS };
  }
  const k = `${id}:${key(sea)}:${ships}`;
  const cached = spotsCache.get(k);
  if (cached) return cached;
  const row = SEA_SPOT_TABLE[k];
  const result = row
    ? { starts: toVecs(row.starts), packSpots: toVecs(row.packSpots), respawns: toVecs(row.respawns) }
    : searchSeaSpots(id, sea, ships);
  spotsCache.set(k, result);
  return result;
}

/**
 * Works out a bigger sea's spots: a ring of starts round the middle, its radius moved (up to RING_SEARCH, the least
 * first) and turned (in whole degrees, the least turn first), with the pack spots moved in or out, the same for every
 * ship (INNER for those in front of the starts, OUTER for those between them), until every start and pack spot is
 * clear of the islands, reefs and wrecks and every pack spot clear of the starts. Respawn spots too close to a pack
 * spot are left out, keeping at least MIN_RESPAWNS. Unturned at the usual radius if nothing fits (the table's test
 * would then fail).
 */
export function searchSeaSpots(id: LayoutId, sea: Sea, ships: number): SeaSpots {
  const ring = startRing(sea) ?? 0;
  const l = spreadLayout(id, sea);
  const candidates = respawnCandidates(l, sea);
  const awayFrom = (spots: readonly Vec[]) => (q: Vec) => spots.every((p) => distance(p, q) > PACK_FROM_SPOTS);
  const fits = ({ starts, packSpots }: { starts: Vec[]; packSpots: Vec[] }) =>
    starts.every((p) => inSea(p, sea, BIGGEST) && clearOf(p, SPOT_FROM_ISLANDS, l))
    && packSpots.every((p) => inSea(p, sea, PACK_FROM_EDGE) && clearOf(p, PACK_FROM_ISLANDS, l, PACK_FROM_REEFS) && starts.every(awayFrom([p])))
    && candidates.filter(awayFrom(packSpots)).length >= MIN_RESPAWNS;
  const step = 360 / ships;
  const radii = [0, ...Array.from({ length: RING_SEARCH / 10 }, (_, i) => [(i + 1) * 10, -(i + 1) * 10]).flat()].map((d) => ring + d);
  const search = (): { starts: Vec[]; packSpots: Vec[] } | null => {
    for (const radius of radii) {
      for (let t = 0; t <= step / 2; t++) {
        for (const turn of t === 0 ? [0] : [t, -t]) {
          for (const outer of OUTER) {
            for (const inner of INNER) {
              const spots = ringSpots(sea, radius, ships, turn, inner, outer);
              if (fits(spots)) return spots;
            }
          }
        }
      }
    }
    return null;
  };
  const spots = search() ?? ringSpots(sea, ring, ships, 0);
  return { ...spots, respawns: candidates.filter(awayFrom(spots.packSpots)) };
}
