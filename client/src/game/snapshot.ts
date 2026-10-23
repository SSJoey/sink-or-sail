import type { ShipView, ShotView, Snapshot } from "./interpolation.ts";

/** The parts of the synced room state the game reads. */
export interface GameStateView {
  ships: Iterable<ShipView>;
  shots: { forEach(cb: (shot: ShotView, id: string) => void): void };
}

/** Copies the synced state (which Colyseus updates in place) into a plain, timestamped snapshot. */
export function snapshotFromState(state: GameStateView, t: number): Snapshot {
  const ships: ShipView[] = [];
  for (const s of state.ships) {
    ships.push({
      x: s.x, y: s.y, heading: s.heading, turret: s.turret, health: s.health, energy: s.energy,
      boosting: s.boosting, shielding: s.shielding, protection: s.protection, sunk: s.sunk, sinkings: s.sinkings,
    });
  }
  const shots = new Map<string, ShotView>();
  state.shots.forEach((shot, id) => shots.set(id, { x: shot.x, y: shot.y, angle: shot.angle }));
  return { t, ships, shots };
}
