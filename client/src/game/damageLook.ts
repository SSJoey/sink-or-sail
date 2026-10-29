import { TUNING, type Vec } from "@sink-or-sail/shared";

/** Stage 4 slice 6: a ship afloat below a quarter of full health shows visible damage (cracks, flames, smoke). */
export function isDamaged(ship: { health: number; sunk: boolean }): boolean {
  return !ship.sunk && ship.health < TUNING.ship.maxHealth * TUNING.client.damage.below;
}

const turn = (pos: Vec, heading: number, p: Vec): Vec => ({
  x: pos.x + p.x * Math.cos(heading) - p.y * Math.sin(heading),
  y: pos.y + p.x * Math.sin(heading) + p.y * Math.cos(heading),
});

/** Crack lines on the deck, in the hull's own frame (bow along +x). */
const CRACKS: readonly (readonly Vec[])[] = [
  [{ x: 15, y: -5 }, { x: 10, y: -1 }, { x: 13, y: 3 }, { x: 8, y: 6 }],
  [{ x: -6, y: 8 }, { x: -10, y: 4 }, { x: -7, y: 1 }],
  [{ x: -16, y: -7 }, { x: -12, y: -4 }, { x: -15, y: -1 }],
];
/** Where the two flames burn, on the deck. */
const FLAMES: readonly Vec[] = [{ x: 9, y: -5 }, { x: -10, y: 5 }];

export const hullCracks = (pos: Vec, heading: number): Vec[][] => CRACKS.map((line) => line.map((p) => turn(pos, heading, p)));
export const flameSpots = (pos: Vec, heading: number): Vec[] => FLAMES.map((p) => turn(pos, heading, p));

/**
 * The smoke in the air now (`now` in ms): puffs leave the deck one after another, drift back from the stern with a
 * little sway, grow and fade. `age` is each puff's seconds since it left.
 */
export function smokePuffs(ship: Vec & { heading: number }, now: number): { x: number; y: number; radius: number; alpha: number; age: number }[] {
  const D = TUNING.client.damage;
  const life = D.smokePuffs * D.smokeEvery;
  const t = now / 1000;
  const start = turn(ship, ship.heading, { x: -6, y: 0 });
  const back = { x: -Math.cos(ship.heading), y: -Math.sin(ship.heading) };
  const side = { x: -back.y, y: back.x };
  return Array.from({ length: D.smokePuffs }, (_, i) => {
    const age = (((t + i * D.smokeEvery) % life) + life) % life;
    const k = age / life;
    const sway = Math.sin(age * 4 + i) * 4 * k;
    const d = D.smokeSpeed * age;
    return {
      x: start.x + back.x * d + side.x * sway,
      y: start.y + back.y * d + side.y * sway,
      radius: D.smokeStart + (D.smokeEnd - D.smokeStart) * k,
      alpha: D.smokeAlpha * (1 - k),
      age,
    };
  });
}
