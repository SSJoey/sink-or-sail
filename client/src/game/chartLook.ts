import { DEFAULT_SEA, SEA_CENTRE, TUNING, circleOverlapsPolygon, pointInPolygon, seaCentre, type Polygon, type Sea, type Vec, type WreckSpot } from "@sink-or-sail/shared";

/** Stage 4 slice 3: the sea-chart look's colours (from the look-options canvas, "1 · Tabletop sea chart"). */
export const CHART = {
  sea: 0xbfd9e3,
  /** The chart's ink: every outline and mark. */
  ink: 0x3b2f22,
  inkDark: 0x1e170f,
  sand: 0xdcc79b,
  wood: 0xcdb98e,
  cream: 0xf6ecd3,
  reefWater: 0xd6e8ee,
  /** Around the sea (the letterbox), and the soft dark edge. */
  deep: 0x1f4a63,
  /** Things that used to be light blue on the dark sea: the EMP ring and sparks, and the shield. */
  emp: 0x1d5fa8,
  shield: 0x1d5fa8,
  /** Stage 4 slice 5: storm clouds and haunting's ink (the mock-up's brown-black fog); the kraken's sea-green wash. */
  storm: 0x2b2118,
  kraken: 0x5e7d6a,
} as const;

const C = () => TUNING.client.chart;

/**
 * A number in [0, 1) from a point, the same for its mirror images: it reads the distance from the sea's middle
 * both ways (not the side), so mirrored layouts get mirrored decoration.
 */
function foldedHash(p: Vec, salt: number, centre: Vec = SEA_CENTRE): number {
  let h = Math.imul(Math.round(Math.abs(p.x - centre.x) * 10) ^ 0x9e3779b1, 0x85ebca6b);
  h = Math.imul(h ^ (Math.round(Math.abs(p.y - centre.y) * 10) + salt * 0x27d4eb2f), 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Moves a point by up to `amount` each way, mirrored with the point (the side of the middle flips the move). */
function jitter(p: Vec, amount: number, centre: Vec = SEA_CENTRE): Vec {
  const sx = Math.sign(p.x - centre.x);
  const sy = Math.sign(p.y - centre.y);
  return { x: p.x + sx * (foldedHash(p, 1, centre) * 2 - 1) * amount, y: p.y + sy * (foldedHash(p, 2, centre) * 2 - 1) * amount };
}

/** Points on a grid `step` apart, symmetric about the sea's middle, covering the box. */
function symmetricGrid(min: Vec, max: Vec, step: number, middle: Vec = SEA_CENTRE): Vec[] {
  const points: Vec[] = [];
  const from = (lo: number, centre: number) => centre - (Math.floor((centre - lo) / step - 0.5) + 0.5) * step;
  for (let x = from(min.x, middle.x); x <= max.x; x += step) {
    for (let y = from(min.y, middle.y); y <= max.y; y += step) points.push({ x, y });
  }
  return points;
}

/** Stage 5: the compass rose keeps today's place from the bottom-right corner of any sea. */
export function compassSpot(sea: Sea = DEFAULT_SEA): { x: number; y: number; radius: number } {
  const { compass } = C();
  return { x: sea.width - (DEFAULT_SEA.width - compass.x), y: sea.height - (DEFAULT_SEA.height - compass.y), radius: compass.radius };
}

/** Where the wave squiggles go: open water only, the same on every device for a layout (and sea, Stage 5). */
export function waveSpots(islands: readonly Polygon[], reefs: readonly Polygon[], wrecks: readonly WreckSpot[], sea: Sea = DEFAULT_SEA): Vec[] {
  const { waveSpacing, waveJitter, waveClearance: clear } = C();
  const compass = compassSpot(sea);
  const { width, height } = sea;
  const middle = seaCentre(sea);
  return symmetricGrid({ x: 0, y: 0 }, { x: width, y: height }, waveSpacing, middle)
    .map((p) => jitter(p, waveJitter, middle))
    .filter((p) =>
      p.x > clear && p.x < width - clear && p.y > clear && p.y < height - clear &&
      Math.hypot(p.x - compass.x, p.y - compass.y) > compass.radius + clear &&
      [...islands, ...reefs].every((shape) => !pointInPolygon(p, shape) && circleOverlapsPolygon(p, clear, shape) === null) &&
      wrecks.every((w) => Math.hypot(p.x - w.pos.x, p.y - w.pos.y) > clear + TUNING.wreck.length / 2));
}

function area(points: Polygon): number {
  let sum = 0;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  });
  return sum / 2;
}

function centroid(points: Polygon): Vec {
  const a = area(points);
  let x = 0;
  let y = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    const cross = p.x * q.y - q.x * p.y;
    x += (p.x + q.x) * cross;
    y += (p.y + q.y) * cross;
  });
  return { x: x / (6 * a), y: y / (6 * a) };
}

function distanceToEdges(p: Vec, points: Polygon): number {
  let best = Infinity;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
    best = Math.min(best, Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t)));
  });
  return best;
}

/** Spots for palm marks, by place in the island's box (from the middle); flipped with a mirrored island. */
const PALM_PLACES: readonly Vec[] = [{ x: -0.05, y: -0.15 }, { x: -0.4, y: 0.15 }, { x: 0.35, y: 0.1 }];

/** Palm marks on an island: one per `palmArea` (at most `maxPalms`), away from the coast. */
export function palmSpots(island: Polygon): Vec[] {
  const { palmArea, maxPalms, palmMargin } = C();
  const count = Math.min(maxPalms, Math.floor(Math.abs(area(island)) / palmArea));
  if (count === 0) return [];
  const c = centroid(island);
  const xs = island.map((p) => p.x);
  const ys = island.map((p) => p.y);
  const half = { x: (Math.max(...xs) - Math.min(...xs)) / 2, y: (Math.max(...ys) - Math.min(...ys)) / 2 };
  // An island on a middle line keeps the places as they are (its centre can be a hair off the line).
  const side = (d: number) => (Math.abs(d) < 1 ? 1 : Math.sign(d));
  const sx = side(c.x - SEA_CENTRE.x);
  const sy = side(c.y - SEA_CENTRE.y);
  return PALM_PLACES.map((f) => ({ x: c.x + sx * f.x * half.x, y: c.y + sy * f.y * half.y }))
    .filter((p) => pointInPolygon(p, island) && distanceToEdges(p, island) >= palmMargin)
    .slice(0, count);
}

/** The chart's rock marks on a reef: dots and small crosses, scattered inside it (at least one). */
export function reefMarks(reef: Polygon): { pos: Vec; kind: "dot" | "cross" }[] {
  const { reefMarkSpacing, reefJitter } = C();
  const xs = reef.map((p) => p.x);
  const ys = reef.map((p) => p.y);
  const marks = symmetricGrid({ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) }, reefMarkSpacing)
    .map((grid) => {
      // About one in three is a cross, chosen by its place on the grid (mirrored with it).
      const cell = Math.round(Math.abs(grid.x - SEA_CENTRE.x) / reefMarkSpacing) + Math.round(Math.abs(grid.y - SEA_CENTRE.y) / reefMarkSpacing);
      return { pos: jitter(grid, reefJitter), kind: cell % 3 === 0 ? ("cross" as const) : ("dot" as const) };
    })
    .filter((m) => pointInPolygon(m.pos, reef));
  return marks.length ? marks : [{ pos: centroid(reef), kind: "dot" }];
}

/** The polygon moved `d` outward (for the dotted shallows off the coast), whichever way round its points go. */
export function offsetPolygon(points: Polygon, d: number): Vec[] {
  const turn = area(points) > 0 ? 1 : -1;
  const normal = (a: Vec, b: Vec) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (turn * (b.y - a.y)) / len, y: (turn * -(b.x - a.x)) / len };
  };
  return points.map((p, i) => {
    const n1 = normal(points[(i - 1 + points.length) % points.length]!, p);
    const n2 = normal(p, points[(i + 1) % points.length]!);
    const mx = n1.x + n2.x;
    const my = n1.y + n2.y;
    const len = Math.hypot(mx, my) || 1;
    // The corner moves along the bisector, far enough that both edges move `d` (capped for very sharp corners).
    const reach = Math.min(d * 3, d / Math.max(0.2, (mx / len) * n1.x + (my / len) * n1.y));
    return { x: p.x + (mx / len) * reach, y: p.y + (my / len) * reach };
  });
}

/** A hand-inked outline: each edge in short steps, each step nudged off the true edge by up to `wobble`. */
export function inkOutline(points: Polygon): Vec[] {
  const { wobble, inkStep } = C();
  const out: Vec[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.round(len / inkStep));
    const n = { x: -(b.y - a.y) / (len || 1), y: (b.x - a.x) / (len || 1) };
    for (let s = 0; s < steps; s++) {
      const p = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps };
      const nudge = s === 0 ? 0 : (foldedHash(p, 4) * 2 - 1) * wobble;
      out.push({ x: p.x + n.x * nudge, y: p.y + n.y * nudge });
    }
  });
  return out;
}

/** The chart's faint grid: lines every `gridStep` across the sea. */
export function gridLines(sea: Sea = DEFAULT_SEA): [Vec, Vec][] {
  const { gridStep } = C();
  const { width, height } = sea;
  const lines: [Vec, Vec][] = [];
  for (let x = gridStep; x < width; x += gridStep) lines.push([{ x, y: 0 }, { x, y: height }]);
  for (let y = gridStep; y < height; y += gridStep) lines.push([{ x: 0, y }, { x: width, y }]);
  return lines;
}

/** How many marks the chart layer draws for a layout (read by the browser tests). */
export function chartMarks(islands: readonly Polygon[], reefs: readonly Polygon[], wrecks: readonly WreckSpot[], sea: Sea = DEFAULT_SEA) {
  return { waves: waveSpots(islands, reefs, wrecks, sea).length, palms: islands.flatMap(palmSpots).length, reefMarks: reefs.flatMap(reefMarks).length };
}
