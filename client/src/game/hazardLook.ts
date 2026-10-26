import { TUNING, type Vec } from "@sink-or-sail/shared";
import type { HazardView, ShipView } from "./interpolation.ts";

const M = TUNING.movingStorm;

/** A moving storm that is drawn as a cloud: active, or fading out. */
const isCloud = (h: HazardView) => h.kind === "movingStorm" && (h.phase === "active" || h.phase === "fading");

/** Whether a spot is under a moving storm's cloud (what's there is hidden from everyone). */
export function hiddenByStorms(pos: Vec, hazards: ReadonlyMap<string, HazardView>): boolean {
  for (const h of hazards.values()) if (isCloud(h) && Math.hypot(pos.x - h.x, pos.y - h.y) <= M.radius) return true;
  return false;
}

/** Ships afloat hidden under a cloud from this viewer: every crew's but their own (`ownCrew`, null with no seat). */
export function hiddenShips(ships: readonly ShipView[], hazards: ReadonlyMap<string, HazardView>, ownCrew: number | null): number[] {
  return ships.flatMap((ship, id) => (id !== ownCrew && !ship.sunk && hiddenByStorms(ship, hazards) ? [id] : []));
}

/** How solid a storm's cloud is drawn: fully while active, fading out to nothing; not at all while only signalled. */
export function cloudAlpha(h: HazardView): number {
  if (h.phase === "active") return 1;
  if (h.phase === "fading") return Math.max(0, Math.min(1, h.timeLeft / M.fadeTime));
  return 0;
}
