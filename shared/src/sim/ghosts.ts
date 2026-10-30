import { DEFAULT_SEA, type Sea } from "./sea.ts";
import { TUNING } from "../tuning.ts";
import type { Ghost, ShipInput, SimEvent } from "./types.ts";
import { add, angleOf, clampLength, length, scale, type Vec } from "./vec.ts";

const G = TUNING.ghost;
const EPSILON = 1e-9;

/** A crew that has just gone out: its ghost, appearing where the ship sank after `appearAfter`. */
export const newGhost = (ship: number, pos: Vec, heading: number): Ghost => ({ ship, pos, heading, appearIn: G.appearAfter });

/**
 * One step of the ghosts: those still to appear count down (`ghostStarted` when they do); those that have
 * appeared move the way their crew steers them, through everything, kept inside the sea.
 */
export function updateGhosts(ghosts: readonly Ghost[], inputs: readonly (ShipInput | undefined)[], dt: number, events: SimEvent[], sea: Sea = DEFAULT_SEA): Ghost[] {
  return ghosts.map((ghost) => {
    if (ghost.appearIn > 0) {
      const appearIn = ghost.appearIn - dt;
      if (appearIn > EPSILON) return { ...ghost, appearIn };
      events.push({ type: "ghostStarted", ship: ghost.ship, pos: ghost.pos });
      return { ...ghost, appearIn: 0 };
    }
    const steer = clampLength(inputs[ghost.ship]?.ghost ?? { x: 0, y: 0 }, 1);
    if (length(steer) < EPSILON) return ghost;
    const moved = add(ghost.pos, scale(steer, G.speed * dt));
    const pos = { x: Math.min(sea.width, Math.max(0, moved.x)), y: Math.min(sea.height, Math.max(0, moved.y)) };
    return { ...ghost, pos, heading: angleOf(steer) };
  });
}
