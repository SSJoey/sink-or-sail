import { isShipType, type PackType } from "@sink-or-sail/shared";
import type { GhostView, HazardView, MineView, PackView, ShipView, ShotView, Snapshot, WreckView } from "./interpolation.ts";

/** The parts of the synced room state the game reads. */
/** A ship as synced: each pack slot is "" when empty. */
type SyncedShip = Omit<ShipView, "pilotPack" | "gunnerPack" | "type"> & { pilotPack: string; gunnerPack: string; type: string };

const slot = (synced: string) => (synced ? (synced as PackType) : null);

export interface GameStateView {
  ships: Iterable<SyncedShip>;
  shots: { forEach(cb: (shot: ShotView, id: string) => void): void };
  packs: { forEach(cb: (pack: PackView, id: string) => void): void };
  mines: { forEach(cb: (mine: MineView, id: string) => void): void };
  torpedoes: { forEach(cb: (torpedo: ShotView, id: string) => void): void };
  wrecks: { forEach(cb: (wreck: WreckView, id: string) => void): void };
  hazards: { forEach(cb: (hazard: HazardView, id: string) => void): void };
  ghosts: { forEach(cb: (ghost: GhostView, id: string) => void): void };
  zones: Iterable<{ meter: number }>;
}

/** Copies the synced state (which Colyseus updates in place) into a plain, timestamped snapshot. */
export function snapshotFromState(state: GameStateView, t: number): Snapshot {
  const ships: ShipView[] = [];
  for (const s of state.ships) {
    ships.push({
      type: isShipType(s.type) ? s.type : "frigate",
      x: s.x, y: s.y, heading: s.heading, turret: s.turret, health: s.health, energy: s.energy,
      boosting: s.boosting, shielding: s.shielding, protection: s.protection, sunk: s.sunk, respawnIn: s.respawnIn,
      sinkings: s.sinkings, sunkBy: s.sunkBy, hits: s.hits,
      pilotPack: slot(s.pilotPack), gunnerPack: slot(s.gunnerPack),
      disabled: s.disabled, empsFired: s.empsFired,
      livesLeft: s.livesLeft, out: s.out, sunkCause: s.sunkCause, stormHits: s.stormHits, krakenHits: s.krakenHits,
    });
  }
  const shots = new Map<string, ShotView>();
  state.shots.forEach((shot, id) => shots.set(id, { x: shot.x, y: shot.y, angle: shot.angle }));
  const packs = new Map<string, PackView>();
  state.packs.forEach((pack, id) => packs.set(id, { x: pack.x, y: pack.y, type: pack.type, signalled: pack.signalled, lifeLeft: pack.lifeLeft }));
  const mines = new Map<string, MineView>();
  state.mines.forEach((mine, id) => mines.set(id, { x: mine.x, y: mine.y, owner: mine.owner, armed: mine.armed }));
  const torpedoes = new Map<string, ShotView>();
  state.torpedoes.forEach((torpedo, id) => torpedoes.set(id, { x: torpedo.x, y: torpedo.y, angle: torpedo.angle }));
  const wrecks = new Map<string, WreckView>();
  state.wrecks.forEach((wreck, id) => wrecks.set(id, { health: wreck.health, hasPack: wreck.hasPack }));
  const hazards = new Map<string, HazardView>();
  state.hazards.forEach((h, id) => hazards.set(id, { kind: h.kind, phase: h.phase, x: h.x, y: h.y, heading: h.heading, timeLeft: h.timeLeft, spin: h.spin, health: h.health, holding: h.holding }));
  const ghosts = new Map<string, GhostView>();
  state.ghosts.forEach((g, id) => ghosts.set(id, { x: g.x, y: g.y, heading: g.heading, zone: g.zone }));
  const zones = [...state.zones].map((z) => z.meter);
  return { t, ships, shots, packs, mines, torpedoes, wrecks, hazards, ghosts, zones };
}
