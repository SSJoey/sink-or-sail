import { SEA_CENTRE, TUNING, type Vec } from "@sink-or-sail/shared";
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
 * position, and its size: Stage 5), the four facing the ship reach out and wrap round it.
 */
export function krakenTentacles(h: HazardView, time: number, held: Vec | null, heldRadius: number = TUNING.ship.radius): Vec[][] {
  const steps = 10;
  const toShip = held ? Math.atan2(held.y - h.y, held.x - h.x) : 0;
  return Array.from({ length: 8 }, (_, k) => {
    const a = h.heading + (k * Math.PI) / 4;
    const start = { x: h.x + Math.cos(a) * K.bodyRadius * 0.8, y: h.y + Math.sin(a) * K.bodyRadius * 0.8 };
    const facing = held !== null && Math.abs(Math.atan2(Math.sin(a - toShip), Math.cos(a - toShip))) <= Math.PI / 2 + 1e-9;
    const end = facing
      ? { x: held!.x + Math.cos(a + time) * heldRadius * 0.7, y: held!.y + Math.sin(a + time) * heldRadius * 0.7 }
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

/**
 * Stage 4 slice 5: the closing storm's diagonal ink hatching, like an old chart's shaded border: lines `spacing`
 * apart across the sea, cut to the pieces outside the safe circle.
 */
export function stormHatch(radius: number, spacing: number = TUNING.client.chart.stormHatch): [Vec, Vec][] {
  const { width: W, height: H } = TUNING.sea;
  const { x: cx, y: cy } = SEA_CENTRE;
  const pieces: [Vec, Vec][] = [];
  // Lines x + y = c, each clipped to the sea.
  for (let c = spacing / 2; c < W + H; c += spacing) {
    const a = { x: Math.max(0, c - H), y: c - Math.max(0, c - H) };
    const b = { x: Math.min(W, c), y: c - Math.min(W, c) };
    const d = { x: b.x - a.x, y: b.y - a.y };
    // Where the line enters and leaves the circle: |a + t·d − centre|² = r².
    const f = { x: a.x - cx, y: a.y - cy };
    const A = d.x * d.x + d.y * d.y;
    const B = 2 * (f.x * d.x + f.y * d.y);
    const C = f.x * f.x + f.y * f.y - radius * radius;
    const disc = B * B - 4 * A * C;
    const at = (t: number): Vec => ({ x: a.x + d.x * t, y: a.y + d.y * t });
    if (A === 0) continue;
    if (disc <= 0) {
      pieces.push([a, b]);
      continue;
    }
    const t1 = (-B - Math.sqrt(disc)) / (2 * A);
    const t2 = (-B + Math.sqrt(disc)) / (2 * A);
    if (t1 > 0) pieces.push([a, at(Math.min(1, t1))]);
    if (t2 < 1) pieces.push([at(Math.max(0, t2)), b]);
  }
  return pieces;
}
