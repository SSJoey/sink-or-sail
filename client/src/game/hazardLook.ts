import { TUNING, type Vec } from "@sink-or-sail/shared";
import type { HazardView, ShipView } from "./interpolation.ts";

const M = TUNING.movingStorm;
const W = TUNING.whirlpool;
const K = TUNING.kraken;
/** Seconds each kind takes to fade out. */
const FADE_TIME: Record<string, number> = { movingStorm: M.fadeTime, whirlpool: W.fadeTime, kraken: K.fadeTime };
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
  if (h.phase === "fading") return Math.max(0, Math.min(1, h.timeLeft / (FADE_TIME[h.kind] ?? 1)));
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

/** Ships held by an active kraken. */
export function heldShips(hazards: ReadonlyMap<string, HazardView>): number[] {
  return [...hazards.values()].filter((h) => h.kind === "kraken" && h.phase === "active" && h.holding >= 0).map((h) => h.holding);
}

/**
 * A kraken's eight tentacles at `time` (seconds), each a wavy line out from its body. Holding a ship (`held`, its
 * position), the four facing the ship reach out and wrap round it.
 */
export function krakenTentacles(h: HazardView, time: number, held: Vec | null): Vec[][] {
  const steps = 10;
  const toShip = held ? Math.atan2(held.y - h.y, held.x - h.x) : 0;
  return Array.from({ length: 8 }, (_, k) => {
    const a = h.heading + (k * Math.PI) / 4;
    const start = { x: h.x + Math.cos(a) * K.bodyRadius * 0.8, y: h.y + Math.sin(a) * K.bodyRadius * 0.8 };
    const facing = held !== null && Math.abs(Math.atan2(Math.sin(a - toShip), Math.cos(a - toShip))) <= Math.PI / 2 + 1e-9;
    const end = facing
      ? { x: held!.x + Math.cos(a + time) * TUNING.ship.radius * 0.7, y: held!.y + Math.sin(a + time) * TUNING.ship.radius * 0.7 }
      : { x: start.x + Math.cos(a) * 40, y: start.y + Math.sin(a) * 40 };
    const side = { x: -(end.y - start.y), y: end.x - start.x };
    const len = Math.hypot(side.x, side.y) || 1;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const f = i / steps;
      const wave = Math.sin(time * 3 + k * 1.3 + f * 5) * 6 * Math.sin(f * Math.PI);
      return { x: start.x + (end.x - start.x) * f + (side.x / len) * wave, y: start.y + (end.y - start.y) * f + (side.y / len) * wave };
    });
  });
}
