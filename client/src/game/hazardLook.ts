import { TUNING, type Vec } from "@sink-or-sail/shared";
import type { HazardView, ShipView } from "./interpolation.ts";

const M = TUNING.movingStorm;
const W = TUNING.whirlpool;
/** How far round a whirlpool's spiral arms twist from the eye to the edge (radians), and how fast they turn. */
const ARM_TWIST = 2.5;
const ARM_TURN = 1.5;

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

/** How strongly a hazard is drawn: fully while active, fading out to nothing; not at all while only signalled. */
export function hazardAlpha(h: HazardView): number {
  if (h.phase === "active") return 1;
  if (h.phase === "fading") return Math.max(0, Math.min(1, h.timeLeft / (h.kind === "whirlpool" ? W.fadeTime : M.fadeTime)));
  return 0;
}

/** A whirlpool's three spiral arms at `time` (seconds), each from the eye out to the edge of its reach, turning with its spin. */
export function whirlpoolArms(h: HazardView, time: number): Vec[][] {
  const steps = 16;
  return [0, 1, 2].map((arm) => {
    const start = h.spin * ARM_TURN * time + (arm * Math.PI * 2) / 3;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const k = i / steps;
      const r = W.eyeRadius + (W.reach - W.eyeRadius) * k;
      const a = start + h.spin * ARM_TWIST * k;
      return { x: h.x + r * Math.cos(a), y: h.y + r * Math.sin(a) };
    });
  });
}
