import { describe, expect, it } from "vitest";
import { PACK_SPOTS_3, Phase, TUNING, createWorld, step, type ShipInput, type World } from "@sink-or-sail/shared";
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

  it("records who sank a ship (-1 for nobody), and with what", () => {
    const state = synced();
    expect(state.ships[1]!.sunkBy).toBe(-1);
    expect(state.ships[1]!.sunkCause).toBe("");
    applyEvents(state, [{ type: "sunk", ship: 1, by: 0, cause: "torpedo" }]);
    expect(state.ships[1]!.sunkBy).toBe(0);
    expect(state.ships[1]!.sunkCause).toBe("torpedo");
    applyEvents(state, [{ type: "sunk", ship: 0, by: null, cause: "ownMine" }]);
    expect(state.ships[0]!.sunkBy).toBe(-1);
    expect(state.ships[0]!.sunkCause).toBe("ownMine");
  });

  it("copies Last Afloat lives and out (-1 lives in Sink Count)", () => {
    const state = new CrewState();
    syncWorld(state, createWorld());
    expect(state.ships[0]!.livesLeft).toBe(-1);
    const world = createWorld({ mode: "lastAfloat", lives: 3 });
    world.ships[1] = { ...world.ships[1]!, livesLeft: 0, out: true, sunk: true };
    syncWorld(state, world);
    expect([state.ships[0]!.livesLeft, state.ships[0]!.out]).toEqual([3, false]);
    expect([state.ships[1]!.livesLeft, state.ships[1]!.out]).toEqual([0, true]);
  });

  it("records the winner, or -1 for a draw", () => {
    const state = synced();
    applyEvents(state, [{ type: "matchEnded", winner: 1, reason: "time" }]);
    expect(state.winner).toBe(1);
    applyEvents(state, [{ type: "matchEnded", winner: null, reason: "lastAfloat" }]);
    expect(state.winner).toBe(-1);
  });
});

describe("ship count in the synced state", () => {
  it("drops the third ship when the next match has only 2", () => {
    const state = new CrewState();
    syncWorld(state, createWorld({ ships: 3 }));
    expect(state.ships).toHaveLength(3);
    syncWorld(state, createWorld());
    expect(state.ships).toHaveLength(2);
  });

  it("places packs at the 3-ship spots in a 3-ship match", () => {
    const state = new CrewState();
    const world = createWorld({ packs: true, seed: 1, ships: 3 });
    world.packs = [{ id: 0, spot: 1, type: "mine", signalLeft: 0, lifeLeft: 45 }];
    syncWorld(state, world);
    expect(state.packs.get("0")?.x).toBeCloseTo(PACK_SPOTS_3[1]!.x);
    expect(state.packs.get("0")?.y).toBeCloseTo(PACK_SPOTS_3[1]!.y);
  });
});

describe("packs in the synced state", () => {
  it("shows each pack's place, type, whether it is still only glowing and its time left, and each ship's two slots", () => {
    const state = new CrewState();
    const world = createWorld({ packs: true, seed: 1 });
    world.packs = [
      { id: 3, spot: 0, type: "mine", signalLeft: 0, lifeLeft: 12.5 },
      { id: 4, spot: 5, type: "health", signalLeft: 1.5, lifeLeft: 20 },
    ];
    world.ships[1] = { ...world.ships[1]!, pilotPack: "mine", gunnerPack: "emp" };
    syncWorld(state, world);
    expect(state.packs.get("3")?.toJSON()).toEqual({ x: 800, y: 150, type: "mine", signalled: false, lifeLeft: 12.5 });
    expect(state.packs.get("4")?.toJSON()).toEqual({ x: 1150, y: 600, type: "health", signalled: true, lifeLeft: 20 });
    expect([state.ships[0]!.pilotPack, state.ships[0]!.gunnerPack]).toEqual(["", ""]);
    expect([state.ships[1]!.pilotPack, state.ships[1]!.gunnerPack]).toEqual(["mine", "emp"]);

    world.packs = [{ id: 4, spot: 5, type: "health", signalLeft: 0, lifeLeft: 19.5 }];
    syncWorld(state, world);
    expect(state.packs.has("3")).toBe(false);
    expect(state.packs.get("4")?.signalled).toBe(false);
    expect(state.packs.get("4")?.lifeLeft).toBe(19.5);
  });
});

describe("wrecks in the synced state", () => {
  it("shows each wreck still standing (by its layout index) with its health and whether it holds a pack, not the type", () => {
    const state = new CrewState();
    const world = createWorld({ hazards: true, packs: true, seed: 1 });
    world.wrecks = world.wrecks.map((w, i) => ({ ...w, pack: i === 2 ? "torpedo" : null }));
    syncWorld(state, world);
    expect([...state.wrecks.keys()]).toEqual(["0", "1", "2", "3"]);
    expect(state.wrecks.get("2")?.toJSON()).toEqual({ health: TUNING.wreck.health, hasPack: true });
    expect(state.wrecks.get("0")?.toJSON()).toEqual({ health: TUNING.wreck.health, hasPack: false });

    world.wrecks = world.wrecks.filter((w) => w.id !== 1).map((w) => (w.id === 2 ? { ...w, health: 20 } : w));
    syncWorld(state, world);
    expect(state.wrecks.has("1")).toBe(false);
    expect(state.wrecks.get("2")?.health).toBe(20);

    // The next match reuses the ids: its wrecks' pack flags replace the last match's.
    const next = createWorld({ hazards: true, packs: true, seed: 2 });
    next.wrecks = next.wrecks.map((w) => ({ ...w, pack: w.id === 0 ? "mine" : null }));
    syncWorld(state, next);
    expect([...state.wrecks.values()].map((w) => w.hasPack)).toEqual([true, false, false, false]);
  });

  it("shows packs released from wrecks where the wreck stood, ready to take", () => {
    const state = new CrewState();
    const world = createWorld({ hazards: true, packs: true, seed: 1 });
    world.wreckPacks = [{ id: 6, wreck: 1, pos: { x: 1150, y: 125 }, type: "emp", lifeLeft: 30 }];
    syncWorld(state, world);
    expect(state.packs.get("6")?.toJSON()).toEqual({ x: 1150, y: 125, type: "emp", signalled: false, lifeLeft: 30 });
    world.wreckPacks = [];
    syncWorld(state, world);
    expect(state.packs.has("6")).toBe(false);
  });

  it("clears the wrecks for a match with hazards off", () => {
    const state = new CrewState();
    syncWorld(state, createWorld({ hazards: true }));
    syncWorld(state, createWorld());
    expect(state.wrecks.size).toBe(0);
  });

  it("flashes a ship hurt by ramming a wreck", () => {
    const state = new CrewState();
    syncWorld(state, createWorld({ hazards: true }));
    applyEvents(state, [{ type: "wreckHit", wreck: 0, by: 1, weapon: "bump", damage: 15, shipDamage: 5 }, { type: "wreckHit", wreck: 0, by: 0, weapon: "bump", damage: 15, shipDamage: 0 }]);
    expect(state.ships.map((s) => s.hits)).toEqual([0, 1]);
  });
});

describe("the closing storm in the synced state", () => {
  it("shows whether the match has a storm, its times and the circle's size now", () => {
    const state = new CrewState();
    const world = createWorld({ mode: "lastAfloat", hazards: true, storm: { startsAt: 10, closedAt: 20 } });
    world.time = 15;
    syncWorld(state, world);
    expect([state.matchStorm, state.stormStartsAt, state.stormClosedAt]).toEqual([true, 10, 20]);
    expect(state.stormRadius).toBeCloseTo((TUNING.closingStorm.startRadius + TUNING.closingStorm.endRadius) / 2, 1);
    syncWorld(state, createWorld({ mode: "lastAfloat" }));
    expect(state.matchStorm).toBe(false);
  });

  it("counts each storm hit on a ship (for its red flash)", () => {
    const state = new CrewState();
    syncWorld(state, createWorld({ mode: "lastAfloat", hazards: true }));
    applyEvents(state, [{ type: "stormDamage", ship: 1, damage: 5 }, { type: "stormDamage", ship: 1, damage: 5 }]);
    expect(state.ships.map((s) => [s.stormHits, s.hits])).toEqual([[0, 0], [2, 0]]);
  });
});

describe("moving storms in the synced state", () => {
  it("shows each hazard's kind, phase, place and heading, and drops it when gone", () => {
    const state = new CrewState();
    const world = createWorld({ hazards: true });
    world.hazards = [{ id: 3, kind: "movingStorm", pos: { x: 400, y: 300 }, heading: 1.5, phase: "signalled", timeLeft: 2, spin: 0 }];
    syncWorld(state, world);
    const synced = state.hazards.get("3")!;
    expect([synced.kind, synced.phase, synced.x, synced.y]).toEqual(["movingStorm", "signalled", 400, 300]);
    expect(synced.heading).toBeCloseTo(1.5);
    world.hazards = [{ ...world.hazards[0]!, pos: { x: 410, y: 300 }, phase: "fading", timeLeft: 0.5 }];
    syncWorld(state, world);
    expect([state.hazards.get("3")!.phase, state.hazards.get("3")!.x, state.hazards.get("3")!.timeLeft]).toEqual(["fading", 410, 0.5]);
    world.hazards = [];
    syncWorld(state, world);
    expect(state.hazards.size).toBe(0);
    // A whirlpool carries its spin (a new match reuses the id).
    world.hazards = [{ id: 3, kind: "whirlpool", pos: { x: 500, y: 300 }, heading: 0, phase: "active", timeLeft: 9, spin: -1 }];
    syncWorld(state, world);
    expect([state.hazards.get("3")!.kind, state.hazards.get("3")!.spin]).toEqual(["whirlpool", -1]);
    // A kraken carries its health and the ship it holds (-1 for none).
    world.hazards = [{ id: 3, kind: "kraken", pos: { x: 500, y: 300 }, heading: 0, phase: "active", timeLeft: 9, spin: 0, health: 40, holding: 1, holdLeft: 2 }];
    syncWorld(state, world);
    expect([state.hazards.get("3")!.kind, state.hazards.get("3")!.health, state.hazards.get("3")!.holding]).toEqual(["kraken", 40, 1]);
    world.hazards = [{ ...world.hazards[0]!, holding: null }];
    syncWorld(state, world);
    expect(state.hazards.get("3")!.holding).toBe(-1);
  });

  it("counts each kraken hit on a held ship (for its red flash)", () => {
    const state = new CrewState();
    syncWorld(state, createWorld({ hazards: true }));
    applyEvents(state, [{ type: "krakenDamage", ship: 0, hazard: 2, damage: 10 }]);
    expect(state.ships.map((s) => [s.krakenHits, s.hits])).toEqual([[1, 0], [0, 0]]);
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

describe("EMP in the synced state", () => {
  it("shows how long each ship stays disabled", () => {
    const state = new CrewState();
    const world = createWorld({ packs: true, seed: 1 });
    world.ships[1] = { ...world.ships[1]!, disabled: 2.5 };
    syncWorld(state, world);
    expect(state.ships[1]!.disabled).toBeCloseTo(2.5);
    expect(state.ships[0]!.disabled).toBe(0);
  });

  it("counts EMPs each ship fired, so clients know when to draw the ring", () => {
    const state = new CrewState();
    syncWorld(state, createWorld({ packs: true, seed: 1 }));
    expect(state.ships[0]!.empsFired).toBe(0);
    applyEvents(state, [{ type: "empFired", ship: 0, caught: [1] }]);
    expect(state.ships[0]!.empsFired).toBe(1);
  });
});
