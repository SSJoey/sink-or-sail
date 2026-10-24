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
