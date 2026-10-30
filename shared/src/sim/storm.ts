import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, type Polygon } from "./geometry.ts";
import { DEFAULT_SEA, seaCentre, seaScale, type Sea } from "./sea.ts";
import type { StormTimes } from "./types.ts";
import { add, distance, normalise, scale, sub, type Vec } from "./vec.ts";

const EPSILON = 1e-9;
const S = TUNING.closingStorm;

export const DEFAULT_STORM_TIMES: StormTimes = { startsAt: S.startsAt, closedAt: S.closedAt };

/**
 * The safe circle's radius at match time `time`: full size until it starts closing, shrinking smoothly to the final
 * size. Stage 5: both sizes grow with the sea's scale.
 */
export function stormRadius(storm: StormTimes, time: number, sea: Sea = DEFAULT_SEA): number {
  const k = seaScale(sea);
  if (time <= storm.startsAt) return S.startRadius * k;
  if (time >= storm.closedAt) return S.endRadius * k;
  const f = (time - storm.startsAt) / (storm.closedAt - storm.startsAt);
  return (S.startRadius + (S.endRadius - S.startRadius) * f) * k;
}

/** A ship is in the storm when its centre is outside the safe circle (round the middle of its sea). */
export const inStorm = (pos: Vec, radius: number, sea: Sea = DEFAULT_SEA) => distance(pos, seaCentre(sea)) > radius + EPSILON;

/** Storm ticks (every `tickSeconds` once it starts closing) in the time from `from` to `to` (from excluded). */
export function stormTicks(storm: StormTimes, from: number, to: number): number {
  const count = (t: number) => (t <= storm.startsAt ? 0 : Math.floor((t - storm.startsAt) / S.tickSeconds + EPSILON));
  return count(to) - count(from);
}

/**
 * Where a ship respawns while the storm closes: its chosen spot if that is well inside the circle; otherwise the
 * spot pulled in toward the middle until it's `respawnInset` inside the circle, then further in until it's clear
 * of every island and wreck (`solids`) for a ship of `shipRadius`.
 */
export function respawnInside(spot: Vec, radius: number, solids: readonly Polygon[], shipRadius: number = TUNING.ship.radius, sea: Sea = DEFAULT_SEA): Vec {
  const SEA_CENTRE = seaCentre(sea);
  const limit = radius - S.respawnInset;
  const fromMiddle = sub(spot, SEA_CENTRE);
  const dist = distance(spot, SEA_CENTRE);
  if (dist <= limit) return spot;
  const dir = normalise(fromMiddle);
  const clear = (p: Vec) => solids.every((solid) => circleOverlapsPolygon(p, shipRadius, solid) === null);
  for (let r = limit; r > 0; r -= 10) {
    const p = add(SEA_CENTRE, scale(dir, r));
    if (clear(p)) return p;
  }
  return SEA_CENTRE;
}
