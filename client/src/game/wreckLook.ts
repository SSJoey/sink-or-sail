import { TUNING, type Polygon, type WreckSpot } from "@sink-or-sail/shared";

// Stage 2 wrecks, placeholder look: a dark wooden hull broken in two, cracking as it takes damage.

/** The two pieces in the hull's own frame (x along the bow, half-length 35, half-width 13), with a jagged gap between. */
const BOW: [number, number][] = [[35, 0], [20, 13], [5, 13], [1, 5], [6, -2], [2, -13], [20, -13]];
const STERN: [number, number][] = [[-3, 13], [-35, 13], [-35, -13], [-2, -13], [-6, -4], [-1, 3]];
/** Crack lines (from, to) on the pieces, in the same frame: the first shows at 2/3 health, both at 1/3. */
export const CRACKS: [[number, number], [number, number]][] = [[[16, -9], [24, 4]], [[-26, 8], [-16, -6]]];

const scaleTo = (spot: WreckSpot) => {
  const sx = TUNING.wreck.length / 70;
  const sy = TUNING.wreck.width / 26;
  const cos = Math.cos(spot.angle);
  const sin = Math.sin(spot.angle);
  return ([u, v]: [number, number]) => ({ x: spot.pos.x + u * sx * cos - v * sy * sin, y: spot.pos.y + u * sx * sin + v * sy * cos });
};

/** The bow and stern pieces, placed at the wreck's spot. */
export function wreckPieces(spot: WreckSpot): [Polygon, Polygon] {
  const place = scaleTo(spot);
  return [BOW.map(place), STERN.map(place)];
}

/** The crack lines showing at this health, placed at the wreck's spot. */
export function crackLines(spot: WreckSpot, health: number) {
  const place = scaleTo(spot);
  return CRACKS.slice(0, wreckCracks(health)).map(([a, b]) => [place(a), place(b)] as const);
}

/** Cracks showing: none above 2/3 of full health, one at or below 2/3, two at or below 1/3. */
export function wreckCracks(health: number): number {
  const full = TUNING.wreck.health;
  if (health <= full / 3 + 1e-9) return 2;
  if (health <= (full * 2) / 3 + 1e-9) return 1;
  return 0;
}

/** Watches each wreck's health: a drop starts a hit flash, like a ship's. */
export class WreckFlashes {
  private readonly flashMs: number;
  private seen = new Map<string, { health: number; hitAt: number }>();

  constructor(flashMs: number) {
    this.flashMs = flashMs;
  }

  update(id: string, health: number, now: number): boolean {
    const prev = this.seen.get(id);
    if (!prev || health > prev.health) {
      // First seen, or a new match's wreck reusing the id.
      this.seen.set(id, { health, hitAt: -Infinity });
      return false;
    }
    if (health < prev.health) prev.hitAt = now;
    prev.health = health;
    return now - prev.hitAt <= this.flashMs;
  }
}
