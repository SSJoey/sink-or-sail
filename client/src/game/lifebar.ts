import { TUNING } from "@sink-or-sail/shared";
import { hiddenByStorms } from "./hazardLook.ts";
import type { HazardView } from "./interpolation.ts";

const C = TUNING.client;

/** How full a ship's lifebar is (0–1). */
export const lifebarFill = (health: number) => Math.max(0, Math.min(1, health / TUNING.ship.maxHealth));

/** Green above half health, amber from a quarter to half, red below a quarter. */
export function lifebarColour(fill: number): "green" | "amber" | "red" {
  if (fill < C.lifebarRedBelow) return "red";
  return fill <= C.lifebarAmberAtOrBelow ? "amber" : "green";
}

/** Stage 4 slice 6: ink ticks on the bar where its colour changes (a quarter and a half). */
export const LIFEBAR_TICKS: readonly number[] = [C.lifebarRedBelow, C.lifebarAmberAtOrBelow];

/** A ship afloat shows its lifebar, unless it is hidden in a moving storm from this viewer (another crew's ship). */
export function lifebarShown(ship: { x: number; y: number; sunk: boolean }, crew: number, ownCrew: number | null, hazards: ReadonlyMap<string, HazardView>): boolean {
  if (ship.sunk) return false;
  return crew === ownCrew || !hiddenByStorms(ship, hazards);
}
