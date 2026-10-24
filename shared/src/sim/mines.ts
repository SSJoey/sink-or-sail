import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, type Polygon } from "./geometry.ts";
import type { Mine, Ship, SimEvent } from "./types.ts";
import { add, distance, fromAngle, scale, type Vec } from "./vec.ts";

/** Guards timer comparisons against float drift from adding dt many times. */
const EPSILON = 1e-9;

/** Where a ship drops its mine: just behind the stern, clear of the hull. */
export function dropSpot(ship: Ship): Vec {
  return add(ship.pos, scale(fromAngle(ship.heading), -(TUNING.ship.radius + TUNING.mine.radius + 2)));
}

/** A mine can't be dropped into the island or off the sea. */
export function canDropAt(pos: Vec, island: Polygon): boolean {
  const r = TUNING.mine.radius;
  const { width, height } = TUNING.sea;
  const inSea = pos.x >= r && pos.x <= width - r && pos.y >= r && pos.y <= height - r;
  return inSea && circleOverlapsPolygon(pos, r, island) === null;
}

export const isArmed = (mine: Mine) => mine.age >= TUNING.mine.armTime - EPSILON;

const touchesMine = (ship: Ship, mine: Mine) => !ship.sunk && distance(ship.pos, mine.pos) < TUNING.ship.radius + TUNING.mine.radius;
const inBlast = (ship: Ship, mine: Mine) => !ship.sunk && distance(ship.pos, mine.pos) < TUNING.ship.radius + TUNING.mine.blastRadius;

/** Damage each touching ship takes: protection blocks it, a raised shield halves it. */
function mineDamage(ship: Ship): number {
  if (ship.protection > 0) return 0;
  const full = TUNING.mine.damage * TUNING.ship.maxHealth;
  return ship.shielding ? full * TUNING.mine.shieldFactor : full;
}

/**
 * A mine goes off: every ship in its blast takes damage. Returns who was hit and who should get credit
 * for any sinking: the shooter if a shot set it off, otherwise the owner; never a ship for sinking itself.
 */
export function blastMine(
  ships: readonly Ship[],
  mine: Mine,
  shooter: number | null,
): { hits: { index: number; damage: number }[]; event: Extract<SimEvent, { type: "mineTriggered" }>; creditFor: (target: number) => number | null } {
  const hits = ships.flatMap((ship, index) => (inBlast(ship, mine) ? [{ index, damage: mineDamage(ship) }] : []));
  const culprit = shooter ?? mine.owner;
  return {
    hits,
    event: {
      type: "mineTriggered",
      mine: mine.id,
      owner: mine.owner,
      shooter,
      hits: hits.map((h) => ({ ship: ships[h.index]!.id, damage: h.damage, ownMine: ships[h.index]!.id === mine.owner })),
    },
    creditFor: (target) => (target === culprit ? null : culprit),
  };
}

/** Ages mines: reports arming and expiry, and finds armed mines a ship is touching (they go off). */
export function updateMines(mines: readonly Mine[], ships: readonly Ship[], dt: number): { mines: Mine[]; touched: Mine[]; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const kept: Mine[] = [];
  const touched: Mine[] = [];
  for (const mine of mines) {
    const aged = { ...mine, age: mine.age + dt };
    if (aged.age >= TUNING.mine.lifetime - EPSILON) {
      events.push({ type: "mineExpired", mine: mine.id, owner: mine.owner });
      continue;
    }
    if (!isArmed(mine) && isArmed(aged)) events.push({ type: "mineArmed", mine: mine.id, owner: mine.owner });
    if (isArmed(aged) && ships.some((ship) => touchesMine(ship, aged))) touched.push(aged);
    else kept.push(aged);
  }
  return { mines: kept, touched, events };
}
