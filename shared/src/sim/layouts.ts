import type { Polygon } from "./geometry.ts";
import { ISLAND, PACK_SPOTS, PACK_SPOTS_3, SEA_CENTRE, START_POINTS, START_POINTS_3 } from "./map.ts";
import { randomIndex } from "./random.ts";
import type { Vec } from "./vec.ts";
import type { WreckSpot } from "./wrecks.ts";

// Stage 2 island layouts (approved 2026-10-26). Every layout but One Island (today's map, kept exactly for the
// Stage 0 recording) is a mirror image left↔right and top↕bottom, so neither 2-ship start is favoured. Every
// layout uses the four corner respawn spots (SPAWN_POINTS) and keeps the corners clear. The automatic checks
// in layouts.test.ts hold every layout to the agreed rules.

export const LAYOUT_IDS = ["oneIsland", "twinIsles", "strait", "fourRocks", "crossroads", "wall", "ring", "archipelago", "slalom"] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export interface Layout {
  id: LayoutId;
  name: string;
  islands: readonly Polygon[];
  /** 2-ship starts, by ship id (left, right) and pack spots. */
  starts: readonly Vec[];
  packSpots: readonly Vec[];
  /** 3-ship starts, by ship id, and pack spots: hand-placed to be roughly fair. */
  starts3: readonly Vec[];
  packSpots3: readonly Vec[];
  /** Stage 2 reefs (slice 3, approved 2026-10-26): every reef ("All"), and the host's "Few" set (part of All). */
  reefs: readonly Polygon[];
  fewReefs: readonly Polygon[];
  /** Stage 2 shipwrecks (slice 4, approved 2026-10-26), mirrored like the reefs. */
  wrecks: readonly WreckSpot[];
}

/** The host's Reefs setting (only with hazards on). */
export const REEF_AMOUNTS = ["none", "few", "all"] as const;
export type ReefAmount = (typeof REEF_AMOUNTS)[number];

/** Radius factors for the 8 points of a rock, from east clockwise: irregular, but the same mirrored both ways. */
const ROCK_SHAPE = [1, 0.8, 0.95, 0.8, 1, 0.8, 0.95, 0.8];

/** A rock or island centred on (x, y), `rx` across and `ry` down from its centre. */
function rock(x: number, y: number, rx: number, ry = rx): Polygon {
  return ROCK_SHAPE.map((f, i) => {
    const a = (i * Math.PI) / 4;
    return { x: x + rx * f * Math.cos(a), y: y + ry * f * Math.sin(a) };
  });
}

const W = 2 * SEA_CENTRE.x;
const H = 2 * SEA_CENTRE.y;

/** A rock placed in the top-left quarter, plus its mirror images in the other three. */
const fourWays = (x: number, y: number, rx: number, ry = rx): Polygon[] => [rock(x, y, rx, ry), rock(W - x, y, rx, ry), rock(x, H - y, rx, ry), rock(W - x, H - y, rx, ry)];
/** A rock on the middle line across (y = middle) or down (x = middle), plus its mirror image. */
const acrossPair = (x: number, rx: number, ry = rx): Polygon[] => [rock(x, SEA_CENTRE.y, rx, ry), rock(W - x, SEA_CENTRE.y, rx, ry)];
const downPair = (y: number, rx: number, ry = rx): Polygon[] => [rock(SEA_CENTRE.x, y, rx, ry), rock(SEA_CENTRE.x, H - y, rx, ry)];
/** Two of a fourWays group: top-left and bottom-right, mirrored through the middle (the same from either 2-ship start). */
const diagonal = (group: readonly Polygon[]): Polygon[] => [group[0]!, group[3]!];
const middle = (rx: number, ry = rx): Polygon => rock(SEA_CENTRE.x, SEA_CENTRE.y, rx, ry);

/** Spots mirrored the same way as the rocks. */
const spots4 = (x: number, y: number): Vec[] => [{ x, y }, { x: W - x, y }, { x, y: H - y }, { x: W - x, y: H - y }];
const spotsAcross = (x: number): Vec[] => [{ x, y: SEA_CENTRE.y }, { x: W - x, y: SEA_CENTRE.y }];
const spotsDown = (y: number): Vec[] => [{ x: SEA_CENTRE.x, y }, { x: SEA_CENTRE.x, y: H - y }];

/** A point `r` from the middle of the sea, at `degrees` (0 = east, 90 = south, as on screen). */
const around = (degrees: number, r: number): Vec => ({
  x: SEA_CENTRE.x + r * Math.cos((degrees * Math.PI) / 180),
  y: SEA_CENTRE.y + r * Math.sin((degrees * Math.PI) / 180),
});
/** 3-ship starts on an equal-sided triangle around the middle: Crew 1 at `first` degrees, then every 120°. */
const triangle = (first: number, r: number): Vec[] => [0, 120, 240].map((d) => around(first + d, r));
/** 3-ship pack spots: two at each of three angles 120° apart (`spread` either side), so no crew is favoured. */
const gapSpots = (first: number, spread: number, r: number): Vec[] =>
  [0, 120, 240].flatMap((d) => [around(first + d - spread, r), around(first + d + spread, r)]);

const TWO_STARTS = START_POINTS;

const DEGREES = Math.PI / 180;
/** A wreck in the top-left quarter at `degrees`, plus its mirror images (the hull mirrored too). */
const wrecks4 = (x: number, y: number, degrees: number): WreckSpot[] => {
  const a = degrees * DEGREES;
  return [
    { pos: { x, y }, angle: a },
    { pos: { x: W - x, y }, angle: Math.PI - a },
    { pos: { x, y: H - y }, angle: -a },
    { pos: { x: W - x, y: H - y }, angle: Math.PI + a },
  ];
};
/**
 * Two wrecks on a middle line, lying along it with their bows toward the middle of the sea, so each is
 * its own mirror image across that line.
 */
const wrecksAcross = (x: number): WreckSpot[] => [{ pos: { x, y: SEA_CENTRE.y }, angle: 0 }, { pos: { x: W - x, y: SEA_CENTRE.y }, angle: Math.PI }];
const wrecksDown = (y: number): WreckSpot[] => [{ pos: { x: SEA_CENTRE.x, y }, angle: Math.PI / 2 }, { pos: { x: SEA_CENTRE.x, y: H - y }, angle: -Math.PI / 2 }];

// Reefs, hand-placed per layout; "Few" keeps a diagonal pair of a group of four, or the middle reef.
const ONE_ISLAND_REEFS = fourWays(700, 275, 45, 35);
const TWIN_MIDDLE = middle(90, 55);
const STRAIT_REEFS = fourWays(450, 300, 45, 35);
const FOUR_ROCKS_MIDDLE = middle(45, 35);
const CROSSROADS_MIDDLE = middle(60);
const WALL_REEFS = acrossPair(560, 45, 120);
const RING_SIDES = acrossPair(500, 45, 35);
const ARCHIPELAGO_REEFS = fourWays(700, 350, 45, 35);
const SLALOM_REEFS = fourWays(625, 325, 45, 35);

export const LAYOUTS: Readonly<Record<LayoutId, Layout>> = {
  oneIsland: {
    id: "oneIsland",
    name: "One Island",
    islands: [ISLAND],
    starts: START_POINTS,
    packSpots: PACK_SPOTS,
    starts3: START_POINTS_3,
    packSpots3: PACK_SPOTS_3,
    reefs: ONE_ISLAND_REEFS,
    fewReefs: diagonal(ONE_ISLAND_REEFS),
    wrecks: wrecks4(450, 125, 30),
  },
  twinIsles: {
    id: "twinIsles",
    name: "Twin Isles",
    islands: downPair(200, 160, 90),
    starts: TWO_STARTS,
    packSpots: [...spots4(450, 250), ...spotsAcross(620)],
    starts3: triangle(180, 430),
    packSpots3: gapSpots(0, 10, 405),
    reefs: [TWIN_MIDDLE, ...fourWays(330, 300, 55, 40)],
    fewReefs: [TWIN_MIDDLE],
    wrecks: wrecks4(600, 350, 30),
  },
  strait: {
    id: "strait",
    name: "The Strait",
    // The long islands stop short of the left third, leaving room for the 3-ship starts.
    islands: [...downPair(180, 200, 50), rock(SEA_CENTRE.x, SEA_CENTRE.y, 70, 60)],
    starts: TWO_STARTS,
    packSpots: [...spotsDown(62), ...spotsAcross(500), ...spotsDown(310)],
    starts3: triangle(0, 430),
    packSpots3: gapSpots(30, 30, 165),
    reefs: STRAIT_REEFS,
    fewReefs: diagonal(STRAIT_REEFS),
    wrecks: wrecks4(600, 325, 30),
  },
  fourRocks: {
    id: "fourRocks",
    name: "Four Rocks",
    islands: [...downPair(220, 65), ...acrossPair(520, 65)],
    starts: TWO_STARTS,
    packSpots: [...spots4(650, 330), ...spotsDown(80)],
    // Stage 5: 10 lower than the triangle round the middle, so the top start is 40 from the edge and an Ironclad fits.
    starts3: triangle(150, 420).map((p) => ({ x: p.x, y: p.y + 10 })),
    packSpots3: gapSpots(90, 10, 390),
    reefs: [FOUR_ROCKS_MIDDLE, ...fourWays(275, 325, 45, 35)],
    fewReefs: [FOUR_ROCKS_MIDDLE],
    wrecks: wrecks4(650, 125, 30),
  },
  crossroads: {
    id: "crossroads",
    name: "Crossroads",
    islands: fourWays(560, 250, 150, 90),
    starts: TWO_STARTS,
    packSpots: [...spotsAcross(560), ...spotsDown(250), ...spotsDown(90)],
    starts3: [{ x: 352, y: 791 }, { x: 1248, y: 791 }, { x: 800, y: 123 }],
    packSpots3: [{ x: 476, y: 438 }, { x: 1124, y: 438 }, { x: 407, y: 97 }, { x: 1193, y: 97 }, { x: 86, y: 435 }, { x: 1514, y: 435 }],
    reefs: [CROSSROADS_MIDDLE, ...acrossPair(270, 40, 90)],
    fewReefs: [CROSSROADS_MIDDLE],
    wrecks: wrecks4(350, 325, 30),
  },
  wall: {
    id: "wall",
    name: "The Wall",
    islands: [rock(SEA_CENTRE.x, SEA_CENTRE.y, 70, 300)],
    starts: TWO_STARTS,
    packSpots: [...spotsDown(75), ...spots4(500, 300)],
    starts3: triangle(180, 430),
    packSpots3: gapSpots(0, 10, 350),
    reefs: WALL_REEFS,
    fewReefs: WALL_REEFS,
    wrecks: wrecks4(650, 300, 30),
  },
  ring: {
    id: "ring",
    name: "The Ring",
    islands: [30, 90, 150, 210, 270, 330].map((d) => {
      const c = around(d, 300);
      return rock(c.x, c.y, 70);
    }),
    starts: TWO_STARTS,
    packSpots: [...spotsDown(300), ...spots4(400, 250)],
    starts3: triangle(180, 430),
    packSpots3: gapSpots(30, 30, 120),
    reefs: [...RING_SIDES, ...fourWays(650, 190, 45, 35)],
    fewReefs: RING_SIDES,
    wrecks: wrecks4(450, 125, 30),
  },
  archipelago: {
    id: "archipelago",
    name: "Archipelago",
    islands: [
      ...fourWays(450, 120, 40),
      ...fourWays(250, 330, 35),
      ...fourWays(640, 250, 38),
      ...acrossPair(420, 38),
      ...downPair(290, 35),
      rock(SEA_CENTRE.x, SEA_CENTRE.y, 55),
    ],
    starts: TWO_STARTS,
    packSpots: [...spots4(560, 360), ...spotsDown(175)],
    starts3: triangle(150, 360),
    packSpots3: gapSpots(90, 10, 365),
    reefs: ARCHIPELAGO_REEFS,
    fewReefs: diagonal(ARCHIPELAGO_REEFS),
    wrecks: wrecksAcross(600),
  },
  slalom: {
    id: "slalom",
    name: "Slalom",
    islands: [
      // Staggered rows: x 480 and 1120 along the top and bottom, the middle column inside, and rows of
      // four (x 330, 640, 960, 1270); gaps left open for the 3-ship starts.
      ...fourWays(480, 105, 30),
      ...downPair(340, 35),
      ...fourWays(330, 225, 30),
      ...fourWays(640, 225, 30),
      ...acrossPair(330, 30),
      ...acrossPair(640, 30),
    ],
    starts: TWO_STARTS,
    packSpots: [...spots4(640, 105), ...spotsAcross(480)],
    starts3: triangle(150, 360),
    packSpots3: gapSpots(90, 10, 365),
    reefs: SLALOM_REEFS,
    fewReefs: diagonal(SLALOM_REEFS),
    wrecks: wrecksDown(200),
  },
};

export const DEFAULT_LAYOUT: LayoutId = "oneIsland";

export const isLayoutId = (value: unknown): value is LayoutId => (LAYOUT_IDS as readonly unknown[]).includes(value);

/**
 * The host's "Random": a layout picked with the match's seed (so the same seed gives the same layout),
 * never the room's previous one. Uses its own copy of the seed, so the match's packs are unchanged.
 */
export function randomLayout(seed: number, previous: LayoutId | null): LayoutId {
  const choices = LAYOUT_IDS.filter((id) => id !== previous);
  return choices[randomIndex(seed >>> 0, choices.length).value]!;
}

/** The reefs a match has: none with hazards off; otherwise the host's None, Few or All of the layout's. */
export function reefsFor(layout: LayoutId, amount: ReefAmount): readonly Polygon[] {
  if (amount === "none") return [];
  return amount === "few" ? LAYOUTS[layout].fewReefs : LAYOUTS[layout].reefs;
}

export const isReefAmount = (value: unknown): value is ReefAmount => (REEF_AMOUNTS as readonly unknown[]).includes(value);
