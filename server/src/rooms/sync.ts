import { PACK_SPOTS, Phase, timeLeft, type SimEvent, type World } from "@sink-or-sail/shared";
import { PackState, ShipState, ShotState, type CrewState } from "./state.ts";

/** Copies the simulation world into the synced room state. Colyseus sends only what changed. */
export function syncWorld(state: CrewState, world: World): void {
  state.phase = world.over ? Phase.Over : Phase.Running;
  state.timeLeft = timeLeft(world);

  while (state.ships.length < world.ships.length) state.ships.push(new ShipState());
  world.ships.forEach((ship, i) => {
    const synced = state.ships[i]!;
    synced.x = ship.pos.x;
    synced.y = ship.pos.y;
    synced.heading = ship.heading;
    synced.turret = ship.turret;
    synced.health = ship.health;
    synced.energy = ship.energy;
    synced.boosting = ship.boosting;
    synced.shielding = ship.shielding;
    synced.protection = ship.protection;
    synced.sunk = ship.sunk;
    synced.respawnIn = ship.respawnIn;
    synced.sinkings = ship.sinkings;
    synced.held = ship.held ?? "";
  });

  const livePacks = new Set(world.packs.map((pack) => String(pack.id)));
  for (const id of [...state.packs.keys()]) {
    if (!livePacks.has(id)) state.packs.delete(id);
  }
  for (const pack of world.packs) {
    const id = String(pack.id);
    const signalled = pack.signalLeft > 0;
    const synced = state.packs.get(id);
    if (synced) synced.signalled = signalled;
    else {
      const spot = PACK_SPOTS[pack.spot]!;
      state.packs.set(id, new PackState({ x: spot.x, y: spot.y, type: pack.type, signalled }));
    }
  }

  const live = new Set(world.shots.map((shot) => String(shot.id)));
  for (const id of [...state.shots.keys()]) {
    if (!live.has(id)) state.shots.delete(id);
  }
  for (const shot of world.shots) {
    const id = String(shot.id);
    const synced = state.shots.get(id);
    if (synced) {
      synced.x = shot.pos.x;
      synced.y = shot.pos.y;
    } else {
      state.shots.set(id, new ShotState({ x: shot.pos.x, y: shot.pos.y, angle: Math.atan2(shot.vel.y, shot.vel.x) }));
    }
  }
}

/** Records what clients need from this step's events: hits (for the hit flash), who sank whom, and the winner. */
export function applyEvents(state: CrewState, events: readonly SimEvent[]): void {
  const ship = (id: number) => state.ships[id];
  for (const event of events) {
    switch (event.type) {
      case "hit": {
        const target = ship(event.target);
        if (target) target.hits++;
        break;
      }
      case "bump":
        event.ships.forEach((id, i) => {
          const target = ship(id);
          if (target && event.damage[i]! > 0) target.hits++;
        });
        break;
      case "sunk": {
        const target = ship(event.ship);
        if (target) target.sunkBy = event.by ?? -1;
        break;
      }
      case "matchEnded":
        state.winner = event.winner ?? -1;
        break;
    }
  }
}
