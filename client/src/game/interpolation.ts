import { wrapAngle } from "@sink-or-sail/shared";

export interface ShipView {
  x: number;
  y: number;
  heading: number;
  turret: number;
  health: number;
  energy: number;
  boosting: boolean;
  shielding: boolean;
  protection: number;
  sunk: boolean;
  sinkings: number;
}

export interface ShotView {
  x: number;
  y: number;
  angle: number;
}

/** One server update, stamped with the client time (ms) it arrived. */
export interface Snapshot {
  t: number;
  ships: ShipView[];
  shots: Map<string, ShotView>;
}

export type Frame = Omit<Snapshot, "t">;

const KEEP_MS = 1000;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Blends between two angles the short way round. */
export const lerpAngle = (a: number, b: number, k: number) => a + wrapAngle(b - a) * k;

function blendShip(a: ShipView, b: ShipView, k: number): ShipView {
  return {
    ...b,
    x: lerp(a.x, b.x, k),
    y: lerp(a.y, b.y, k),
    heading: lerpAngle(a.heading, b.heading, k),
    turret: lerpAngle(a.turret, b.turret, k),
    health: lerp(a.health, b.health, k),
    energy: lerp(a.energy, b.energy, k),
  };
}

/** Keeps recent server snapshots and blends between the two around a render time. */
export class SnapshotBuffer {
  private snapshots: Snapshot[] = [];

  get size(): number {
    return this.snapshots.length;
  }

  push(snapshot: Snapshot): void {
    this.snapshots.push(snapshot);
    const cutoff = snapshot.t - KEEP_MS;
    while (this.snapshots.length > 2 && this.snapshots[0]!.t < cutoff) this.snapshots.shift();
  }

  clear(): void {
    this.snapshots = [];
  }

  sample(renderTime: number): Frame | null {
    const list = this.snapshots;
    if (list.length === 0) return null;
    if (renderTime <= list[0]!.t) return list[0]!;
    const last = list[list.length - 1]!;
    if (renderTime >= last.t) return last;

    let i = 1;
    while (list[i]!.t < renderTime) i++;
    const a = list[i - 1]!;
    const b = list[i]!;
    const k = (renderTime - a.t) / (b.t - a.t);

    const ships = b.ships.map((ship, index) => {
      const before = a.ships[index];
      return before ? blendShip(before, ship, k) : ship;
    });
    const shots = new Map<string, ShotView>();
    for (const [id, shot] of b.shots) {
      const before = a.shots.get(id);
      shots.set(id, before ? { x: lerp(before.x, shot.x, k), y: lerp(before.y, shot.y, k), angle: shot.angle } : shot);
    }
    return { ships, shots };
  }
}
