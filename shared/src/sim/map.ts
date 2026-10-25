import { TUNING } from "../tuning.ts";
import type { Polygon } from "./geometry.ts";
import type { Vec } from "./vec.ts";

const { width, height } = TUNING.sea;

/** The one Stage 0 island: an irregular shape about 290 × 200, in the middle of the sea. */
export const ISLAND: Polygon = [
  { x: 660, y: 420 },
  { x: 720, y: 360 },
  { x: 820, y: 350 },
  { x: 910, y: 380 },
  { x: 950, y: 450 },
  { x: 900, y: 530 },
  { x: 790, y: 550 },
  { x: 690, y: 510 },
];

/** Where each ship starts a match, by ship id: left and right, facing the middle. */
export const START_POINTS: readonly Vec[] = [
  { x: 150, y: height / 2 },
  { x: width - 150, y: height / 2 },
];

/** Respawn candidates, one near each corner. */
export const SPAWN_POINTS: readonly Vec[] = [
  { x: 200, y: 180 },
  { x: width - 200, y: 180 },
  { x: 200, y: height - 180 },
  { x: width - 200, y: height - 180 },
];

/** Pack spawn spots in open water, mirror-symmetric so neither crew is favoured. */
export const PACK_SPOTS: readonly Vec[] = [
  { x: 800, y: 150 },
  { x: 800, y: 750 },
  { x: 450, y: 300 },
  { x: 450, y: 600 },
  { x: 1150, y: 300 },
  { x: 1150, y: 600 },
];

export const SEA_CENTRE: Vec = { x: width / 2, y: height / 2 };

/** A point `r` from the middle of the sea, at `degrees` (0 = east, 90 = south, as on screen). */
const aroundCentre = (degrees: number, r: number): Vec => ({
  x: SEA_CENTRE.x + r * Math.cos((degrees * Math.PI) / 180),
  y: SEA_CENTRE.y + r * Math.sin((degrees * Math.PI) / 180),
});

/**
 * Starts for a 3-ship match, by ship id: an equal-sided triangle centred on the island (about 625 apart,
 * just over gun range), so no crew is favoured. Crew 1 bottom left, Crew 2 bottom right, Crew 3 top.
 */
export const START_POINTS_3: readonly Vec[] = [150, 30, 270].map((degrees) => aroundCentre(degrees, 360));

/**
 * Pack spots for a 3-ship match: two in each gap between the starts (15° either side of it, 320 from the
 * middle), so they repeat every 120° and no crew is favoured.
 */
export const PACK_SPOTS_3: readonly Vec[] = [90, 210, 330].flatMap((gap) => [aroundCentre(gap - 15, 320), aroundCentre(gap + 15, 320)]);
