import { TUNING } from "../tuning.ts";
import type { Vec } from "./vec.ts";

/** Stage 5 slice 5: a match's sea, sized by its number of ships. */
export interface Sea {
  width: number;
  height: number;
}

/** Today's one-screen sea (2–4 ships). */
export const DEFAULT_SEA: Sea = { width: TUNING.sea.width, height: TUNING.sea.height };

const sizeFor = (ships: number) => TUNING.seaSizes.find((s) => ships <= s.upTo) ?? TUNING.seaSizes[TUNING.seaSizes.length - 1]!;

/** The sea for a match of `ships` ships. */
export function seaFor(ships: number): Sea {
  const { width, height } = sizeFor(ships);
  return { width, height };
}

export const seaCentre = (sea: Sea): Vec => ({ x: sea.width / 2, y: sea.height / 2 });

/** How many times today's sea it is across (1, 2 or 2.5). */
export const seaScale = (sea: Sea): number => sea.width / DEFAULT_SEA.width;

/** The ring the starts go round on a bigger sea, or null on today's sea (hand-placed starts). */
export function startRing(sea: Sea): number | null {
  return TUNING.seaSizes.find((s) => s.width === sea.width && s.height === sea.height)?.startRing ?? null;
}

/** Test servers only: `SEA_SIZE=3200x1800` (one of the agreed sizes) for a bigger sea with fewer ships; null otherwise. */
export function parseSeaSize(text: string | undefined): Sea | null {
  const match = /^(\d+)x(\d+)$/.exec(text ?? "");
  if (!match) return null;
  const size = TUNING.seaSizes.find((s) => s.width === Number(match[1]) && s.height === Number(match[2]));
  return size ? { width: size.width, height: size.height } : null;
}

/** Packs on the map at once: at least `maxOnMap`, one for every `shipsPerPack` ships. */
export const packLimit = (ships: number): number => Math.max(TUNING.packs.maxOnMap, Math.ceil(ships / TUNING.packs.shipsPerPack));

export const inSea = (p: Vec, sea: Sea, margin = 0): boolean => p.x >= margin && p.y >= margin && p.x <= sea.width - margin && p.y <= sea.height - margin;
