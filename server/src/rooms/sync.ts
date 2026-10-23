import { Phase, timeLeft, type World } from "@sink-or-sail/shared";
import { ShipState, ShotState, type CrewState } from "./state.ts";

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
  });

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
