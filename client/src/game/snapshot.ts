import type { PackType } from "@sink-or-sail/shared";
import type { MineView, PackView, ShipView, ShotView, Snapshot } from "./interpolation.ts";

/** The parts of the synced room state the game reads. */
/** A ship as synced: the held pack is "" when the slot is empty. */
type SyncedShip = Omit<ShipView, "held"> & { held: string };

export interface GameStateView {
  ships: Iterable<SyncedShip>;
  shots: { forEach(cb: (shot: ShotView, id: string) => void): void };
  packs: { forEach(cb: (pack: PackView, id: string) => void): void };
  mines: { forEach(cb: (mine: MineView, id: string) => void): void };
  torpedoes: { forEach(cb: (torpedo: ShotView, id: string) => void): void };
}

/** Copies the synced state (which Colyseus updates in place) into a plain, timestamped snapshot. */
export function snapshotFromState(state: GameStateView, t: number): Snapshot {
  const ships: ShipView[] = [];
  for (const s of state.ships) {
    ships.push({
      x: s.x, y: s.y, heading: s.heading, turret: s.turret, health: s.health, energy: s.energy,
      boosting: s.boosting, shielding: s.shielding, protection: s.protection, sunk: s.sunk, respawnIn: s.respawnIn,
      sinkings: s.sinkings, sunkBy: s.sunkBy, hits: s.hits, held: s.held ? (s.held as PackType) : null,
      disabled: s.disabled, empsFired: s.empsFired,
    });
  }
  const shots = new Map<string, ShotView>();
  state.shots.forEach((shot, id) => shots.set(id, { x: shot.x, y: shot.y, angle: shot.angle }));
  const packs = new Map<string, PackView>();
  state.packs.forEach((pack, id) => packs.set(id, { x: pack.x, y: pack.y, type: pack.type, signalled: pack.signalled }));
  const mines = new Map<string, MineView>();
  state.mines.forEach((mine, id) => mines.set(id, { x: mine.x, y: mine.y, owner: mine.owner, armed: mine.armed }));
  const torpedoes = new Map<string, ShotView>();
  state.torpedoes.forEach((torpedo, id) => torpedoes.set(id, { x: torpedo.x, y: torpedo.y, angle: torpedo.angle }));
  return { t, ships, shots, packs, mines, torpedoes };
}
