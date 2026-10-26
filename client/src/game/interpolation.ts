import { wrapAngle, type PackType } from "@sink-or-sail/shared";

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
  respawnIn: number;
  sinkings: number;
  /** Ship id that last sank this ship; -1 for nobody. */
  sunkBy: number;
  /** Hits taken this match (for the hit flash). */
  hits: number;
  /** The crew's two pack slots: the pilot's (a mine) and the gunner's (a torpedo or EMP). */
  pilotPack: PackType | null;
  gunnerPack: PackType | null;
  /** Seconds left of an EMP. */
  disabled: number;
  /** EMPs this ship fired (the client draws a ring when it goes up). */
  empsFired: number;
  /** Last Afloat: sinkings the ship can still take (-1 in Sink Count), and whether it is out. */
  livesLeft: number;
  out: boolean;
  /** What sank it last (a SinkCause), "" for nothing yet. */
  sunkCause: string;
  /** Stage 2: closing-storm hits taken (each flashes the hull red). */
  stormHits: number;
}

export interface PackView {
  x: number;
  y: number;
  type: string;
  /** Still only glowing: can't be picked up yet. */
  signalled: boolean;
  /** Seconds before it disappears unpicked. */
  lifeLeft: number;
}

export interface MineView {
  x: number;
  y: number;
  owner: number;
  armed: boolean;
}

/** Stage 2: a wreck still standing (keyed by its index in the match layout's wrecks). */
export interface WreckView {
  health: number;
  /** Holds a pack (shown as a glint; the type stays hidden). */
  hasPack: boolean;
}

/** Stage 2: a dynamic hazard on the sea (a moving storm or a whirlpool). */
export interface HazardView {
  kind: string;
  /** "signalled", "active" or "fading". */
  phase: string;
  x: number;
  y: number;
  heading: number;
  /** Seconds left in its phase. */
  timeLeft: number;
  /** Whirlpool: 1 clockwise, -1 anticlockwise; 0 for other kinds. */
  spin: number;
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
  packs: Map<string, PackView>;
  mines: Map<string, MineView>;
  torpedoes: Map<string, ShotView>;
  wrecks: Map<string, WreckView>;
  hazards: Map<string, HazardView>;
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

/** Shots and torpedoes: blend those in both snapshots, show new ones where they are, drop gone ones. */
function blendMoving(a: Map<string, ShotView>, b: Map<string, ShotView>, k: number): Map<string, ShotView> {
  const out = new Map<string, ShotView>();
  for (const [id, item] of b) {
    const before = a.get(id);
    out.set(id, before ? { x: lerp(before.x, item.x, k), y: lerp(before.y, item.y, k), angle: item.angle } : item);
  }
  return out;
}

/** Hazards move: blend the position of those in both snapshots; everything else from the newer one. */
function blendHazards(a: Map<string, HazardView>, b: Map<string, HazardView>, k: number): Map<string, HazardView> {
  const out = new Map<string, HazardView>();
  for (const [id, item] of b) {
    const before = a.get(id);
    out.set(id, before ? { ...item, x: lerp(before.x, item.x, k), y: lerp(before.y, item.y, k) } : item);
  }
  return out;
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
    // Packs, mines and wrecks don't move: take them from the newer snapshot.
    return { ships, shots: blendMoving(a.shots, b.shots, k), packs: b.packs, mines: b.mines, torpedoes: blendMoving(a.torpedoes, b.torpedoes, k), wrecks: b.wrecks, hazards: blendHazards(a.hazards, b.hazards, k) };
  }
}
