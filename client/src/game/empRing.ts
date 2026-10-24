import { TUNING } from "@sink-or-sail/shared";

/** The EMP ring at `elapsedMs` after firing: grows to the EMP radius, then fades; null once gone. */
export function empRingAt(elapsedMs: number): { radius: number; alpha: number } | null {
  const grow = TUNING.client.empRingGrowMs;
  const fade = TUNING.client.empRingFadeMs;
  if (elapsedMs < grow) return { radius: (TUNING.emp.radius * elapsedMs) / grow, alpha: 1 };
  if (elapsedMs < grow + fade) return { radius: TUNING.emp.radius, alpha: 1 - (elapsedMs - grow) / fade };
  return null;
}

/** Starts a ring at a ship each time its EMP count goes up (index = ship id). */
export class EmpRings {
  private counts = new Map<number, number>();
  private rings: { x: number; y: number; start: number }[] = [];

  update(ships: readonly { x: number; y: number; empsFired: number }[], now: number): void {
    ships.forEach((ship, id) => {
      const before = this.counts.get(id);
      if (before !== undefined && ship.empsFired > before) this.rings.push({ x: ship.x, y: ship.y, start: now });
      this.counts.set(id, ship.empsFired);
    });
  }

  active(now: number): { x: number; y: number; radius: number; alpha: number }[] {
    this.rings = this.rings.filter((ring) => empRingAt(now - ring.start) !== null);
    return this.rings.map((ring) => ({ x: ring.x, y: ring.y, ...empRingAt(now - ring.start)! }));
  }
}
