import { describe, expect, it } from "vitest";
import { Phase, TUNING, createWorld, step, type ShipInput, type World } from "@sink-or-sail/shared";
import { CrewState } from "./state.ts";
import { syncWorld } from "./sync.ts";

const fireAll: ShipInput = {
  pilot: { steer: { x: 1, y: 0 }, boost: true },
  gunner: { aim: { x: 0, y: -1 }, fire: true, shield: false },
};

function advance(world: World, seconds: number): World {
  let w = world;
  for (let t = 0; t < seconds; t += 0.05) w = step(w, [fireAll], 0.05).world;
  return w;
}

describe("syncWorld", () => {
  it("copies every ship's visible fields", () => {
    const state = new CrewState();
    const world = advance(createWorld(), 1);
    syncWorld(state, world);

    expect(state.ships.length).toBe(2);
    const ship = world.ships[0]!;
    const synced = state.ships[0]!;
    expect(synced.x).toBeCloseTo(ship.pos.x, 3);
    expect(synced.y).toBeCloseTo(ship.pos.y, 3);
    expect(synced.heading).toBeCloseTo(ship.heading, 5);
    expect(synced.turret).toBeCloseTo(ship.turret, 5);
    expect(synced.health).toBeCloseTo(ship.health, 3);
    expect(synced.energy).toBeCloseTo(ship.energy, 3);
    expect(synced.boosting).toBe(true);
    expect(synced.shielding).toBe(false);
    expect(synced.protection).toBe(0);
    expect(synced.sunk).toBe(false);
    expect(synced.respawnIn).toBe(0);
    expect(synced.sinkings).toBe(0);
  });

  it("adds new shots and removes shots that are gone", () => {
    const state = new CrewState();
    let world = advance(createWorld(), 0.1);
    syncWorld(state, world);
    expect(state.shots.size).toBe(world.shots.length);
    const firstId = String(world.shots[0]!.id);
    expect(state.shots.get(firstId)?.angle).toBeCloseTo(-Math.PI / 2, 5);

    world = advance(world, 3); // first shot has long passed its range
    syncWorld(state, world);
    expect(state.shots.has(firstId)).toBe(false);
    expect([...state.shots.keys()].sort()).toEqual(world.shots.map((s) => String(s.id)).sort());
    const shot = world.shots[0]!;
    expect(state.shots.get(String(shot.id))?.x).toBeCloseTo(shot.pos.x, 3);
  });

  it("shows time left and the phase", () => {
    const state = new CrewState();
    expect(state.phase).toBe(Phase.Waiting);
    syncWorld(state, { ...createWorld(), time: 100 });
    expect(state.phase).toBe(Phase.Running);
    expect(state.timeLeft).toBeCloseTo(TUNING.match.duration - 100, 3);
    syncWorld(state, { ...createWorld(), time: TUNING.match.duration, over: true });
    expect(state.phase).toBe(Phase.Over);
    expect(state.timeLeft).toBe(0);
  });
});
