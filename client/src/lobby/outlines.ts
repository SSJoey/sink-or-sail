import { LAYOUTS, RANDOM_LAYOUT, isLayoutId, isReefAmount, reefsFor, type Polygon, type ShipType, type Vec } from "@sink-or-sail/shared";
import { hullPoints } from "../game/hull.ts";

/** Stage 5 slice 4: one box for every type's outline (the biggest fits), so the sizes compare as on the sea. */
export const HULL_VIEWBOX = "-36 -20 72 40";

const path = (points: readonly Vec[]) =>
  points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

/** The picked type's hull as an SVG path (sea units, bow to the right), the same shape as on the sea. */
export function hullOutline(type: ShipType): string {
  return path(hullPoints({ x: 0, y: 0 }, 0, type));
}

/**
 * Stage 5 slice 4: the chosen layout as SVG paths in sea units (islands, and reefs as the host's settings give them),
 * or null for Random.
 */
export function layoutOutline(setting: string, hazardsOn: boolean, reefs: string): { islands: string[]; reefs: string[] } | null {
  if (setting === RANDOM_LAYOUT || !isLayoutId(setting)) return null;
  const amount = hazardsOn && isReefAmount(reefs) ? reefs : "none";
  return {
    islands: LAYOUTS[setting].islands.map((island: Polygon) => path(island)),
    reefs: reefsFor(setting, amount).map((reef) => path(reef)),
  };
}
