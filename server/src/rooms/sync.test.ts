import { describe, expect, it } from "vitest";
import { Phase, TUNING, createWorld, step, type ShipInput, type World } from "@sink-or-sail/shared";
import { CrewState } from "./state.ts";
import { applyEvents, syncWorld } from "./sync.ts";

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

describe("applyEvents", () => {
  const synced = () => {
    const state = new CrewState();
    syncWorld(state, createWorld());
    return state;
  };

  it("counts hits on the target ship, including damaging bumps", () => {
    const state = synced();
    applyEvents(state, [
      { type: "hit", attacker: 0, target: 1, damage: 20 },
      { type: "hit", attacker: 0, target: 1, damage: 20 },
      { type: "bump", ships: [0, 1], damage: [5, 0] },
      { type: "bump", ships: [0, 1], damage: [0, 0] },
    ]);
    expect(state.ships[1]!.hits).toBe(2);
    expect(state.ships[0]!.hits).toBe(1);
  });

  it("records who sank a ship (-1 for nobody)", () => {
    const state = synced();
    expect(state.ships[1]!.sunkBy).toBe(-1);
    applyEvents(state, [{ type: "sunk", ship: 1, by: 0 }]);
    expect(state.ships[1]!.sunkBy).toBe(0);
    applyEvents(state, [{ type: "sunk", ship: 0, by: null }]);
    expect(state.ships[0]!.sunkBy).toBe(-1);
  });

  it("records the winner, or -1 for a draw", () => {
    const state = synced();
    applyEvents(state, [{ type: "matchEnded", winner: 1 }]);
    expect(state.winner).toBe(1);
    applyEvents(state, [{ type: "matchEnded", winner: null }]);
    expect(state.winner).toBe(-1);
  });
});

describe("packs in the synced state", () => {
  it("shows each pack's place, type and whether it is still only glowing, and each ship's held pack", () => {
    const state = new CrewState();
    const world = createWorld({ packs: true, seed: 1 });
    world.packs = [
      { id: 3, spot: 0, type: "mine", signalLeft: 0 },
      { id: 4, spot: 5, type: "health", signalLeft: 1.5 },
    ];
    world.ships[1] = { ...world.ships[1]!, held: "emp" };
    syncWorld(state, world);
    expect(state.packs.get("3")?.toJSON()).toEqual({ x: 800, y: 150, type: "mine", signalled: false });
    expect(state.packs.get("4")?.toJSON()).toEqual({ x: 1150, y: 600, type: "health", signalled: true });
    expect(state.ships[0]!.held).toBe("");
    expect(state.ships[1]!.held).toBe("emp");

    world.packs = [{ id: 4, spot: 5, type: "health", signalLeft: 0 }];
    syncWorld(state, world);
    expect(state.packs.has("3")).toBe(false);
    expect(state.packs.get("4")?.signalled).toBe(false);
  });
});

describe("mines in the synced state", () => {
  it("shows each mine's place, owner and whether it is armed", () => {
    const state = new CrewState();
    const world = createWorld({ packs: true, seed: 1 });
    world.mines = [
      { id: 0, owner: 1, pos: { x: 300, y: 200 }, age: 0.5 },
      { id: 1, owner: 0, pos: { x: 500, y: 600 }, age: 2 },
    ];
    syncWorld(state, world);
    expect(state.mines.get("0")?.toJSON()).toEqual({ x: 300, y: 200, owner: 1, armed: false });
    expect(state.mines.get("1")?.toJSON()).toEqual({ x: 500, y: 600, owner: 0, armed: true });

    world.mines = [{ id: 0, owner: 1, pos: { x: 300, y: 200 }, age: 1.2 }];
    syncWorld(state, world);
    expect(state.mines.has("1")).toBe(false);
    expect(state.mines.get("0")?.armed).toBe(true);
  });
});

describe("torpedoes in the synced state", () => {
  it("shows each torpedo's place and direction, and drops ones that are gone", () => {
    const state = new CrewState();
    const world = createWorld({ packs: true, seed: 1 });
    world.torpedoes = [{ id: 2, owner: 0, pos: { x: 400, y: 200 }, vel: { x: 0, y: 300 } }];
    syncWorld(state, world);
    const synced = state.torpedoes.get("2")!;
    expect(synced.x).toBeCloseTo(400);
    expect(synced.y).toBeCloseTo(200);
    expect(synced.angle).toBeCloseTo(Math.PI / 2, 5);

    world.torpedoes = [{ id: 2, owner: 0, pos: { x: 400, y: 215 }, vel: { x: 0, y: 300 } }];
    syncWorld(state, world);
    expect(state.torpedoes.get("2")!.y).toBeCloseTo(215);
    world.torpedoes = [];
    syncWorld(state, world);
    expect(state.torpedoes.size).toBe(0);
  });
});
