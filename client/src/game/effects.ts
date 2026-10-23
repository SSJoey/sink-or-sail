interface Seen {
  hits: number;
  sunk: boolean;
  hitAt: number;
  sunkAt: number;
}

export interface ShipEffect {
  flashing: boolean;
  /** Opacity while a sunk ship fades out (1 → 0); null when the ship is afloat. */
  sinkAlpha: number | null;
  /** True on the one update where the ship went down. */
  justSank: boolean;
}

/** Watches each ship's hit count and sunk flag to drive the hit flash, the sink fade and the vibration. */
export class ShipEffects {
  private readonly flashMs: number;
  private readonly fadeMs: number;
  private seen = new Map<number, Seen>();

  constructor(flashMs: number, fadeMs: number) {
    this.flashMs = flashMs;
    this.fadeMs = fadeMs;
  }

  update(id: number, ship: { hits: number; sunk: boolean }, now: number): ShipEffect {
    const prev = this.seen.get(id);
    if (!prev) {
      this.seen.set(id, { hits: ship.hits, sunk: ship.sunk, hitAt: -Infinity, sunkAt: -Infinity });
      return { flashing: false, sinkAlpha: ship.sunk ? 0 : null, justSank: false };
    }
    if (ship.hits > prev.hits) prev.hitAt = now;
    const justSank = ship.sunk && !prev.sunk;
    if (justSank) prev.sunkAt = now;
    prev.hits = ship.hits;
    prev.sunk = ship.sunk;

    const sinkAlpha = ship.sunk ? Math.max(0, 1 - (now - prev.sunkAt) / this.fadeMs) : null;
    return { flashing: now - prev.hitAt <= this.flashMs, sinkAlpha, justSank };
  }

  reset(): void {
    this.seen.clear();
  }
}
