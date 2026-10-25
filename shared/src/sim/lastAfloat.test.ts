import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { createWorld, matchDuration, matchResult, timeLeft } from "./match.ts";
import { step } from "./step.ts";
import type { ShipInput, SimEvent, World } from "./types.ts";

const DT = 0.05;
const L = TUNING.lastAfloat;

const idle: ShipInput = { pilot: { steer: { x: 0, y: 0 }, boost: false }, gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false } };
const fireEast: ShipInput = { ...idle, gunner: { aim: { x: 1, y: 0 }, fire: true, shield: false } };

/** Ship 0 at (400, 200) aiming east at ship 1 at (600, 200); extra ships (if any) parked far away. */
function duel(options: { lives?: number; ships?: 2 | 3 } = {}): World {
  const world = createWorld({ mode: "lastAfloat", lives: options.lives ?? 2, ships: options.ships });
  world.ships[0] = { ...world.ships[0]!, pos: { x: 400, y: 200 }, heading: 0, turret: 0 };
  world.ships[1] = { ...world.ships[1]!, pos: { x: 600, y: 200 }, heading: Math.PI, turret: Math.PI };
  if (world.ships[2]) world.ships[2] = { ...world.ships[2]!, pos: { x: 1400, y: 800 } };
  return world;
}

function run(world: World, seconds: number, inputs: (w: World) => (ShipInput | undefined)[]) {
  const events: SimEvent[] = [];
  let w = world;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const result = step(w, inputs(w), DT);
    w = result.world;
    events.push(...result.events);
  }
  return { world: w, events };
}

/** Ship 0 fires until ship 1 has sunk once more (ship 1 sits still; respawn protection blocks shots). */
function sinkShip1(world: World) {
  const events: SimEvent[] = [];
  let w = world;
  const sunkBefore = (e: SimEvent[]) => e.filter((x) => x.type === "sunk").length;
  for (let i = 0; i < 2000 && sunkBefore(events) === 0; i++) {
    const result = step(w, [fireEast, idle], DT);
    w = result.world;
    events.push(...result.events);
  }
  return { world: w, events };
}

describe("createWorld: modes and lives", () => {
  it("is Sink Count by default, with no lives", () => {
    const world = createWorld();
    expect(world.mode).toBe("sinkCount");
    expect(world.ships.map((s) => [s.livesLeft, s.out])).toEqual([[null, false], [null, false]]);
  });

  it(`Last Afloat gives every ship the lives chosen (default ${L.lives})`, () => {
    expect(createWorld({ mode: "lastAfloat" }).ships.map((s) => s.livesLeft)).toEqual([L.lives, L.lives]);
    expect(createWorld({ mode: "lastAfloat", lives: 4, ships: 3 }).ships.map((s) => s.livesLeft)).toEqual([4, 4, 4]);
  });

  it(`Last Afloat runs ${L.duration} s; Sink Count ${TUNING.match.duration} s`, () => {
    expect(matchDuration(createWorld())).toBe(TUNING.match.duration);
    expect(matchDuration(createWorld({ mode: "lastAfloat" }))).toBe(L.duration);
    expect(timeLeft({ ...createWorld({ mode: "lastAfloat" }), time: 100 })).toBe(L.duration - 100);
  });
});

describe("Last Afloat: lives", () => {
  it("a sinking costs a life, and the ship respawns as in Sink Count", () => {
    const { world, events } = sinkShip1(duel({ lives: 2 }));
    expect(events.filter((e) => e.type === "sunk")).toEqual([{ type: "sunk", ship: 1, by: 0, cause: "shot", livesLeft: 1 }]);
    expect(world.ships[1]).toMatchObject({ sunk: true, out: false, livesLeft: 1, respawnIn: TUNING.respawn.delay });
    expect(world.ships[0]!.sinkings).toBe(1);

    const later = run(world, TUNING.respawn.delay + DT, () => [idle, idle]);
    expect(later.events).toContainEqual(expect.objectContaining({ type: "respawned", ship: 1 }));
    expect(later.world.ships[1]).toMatchObject({ sunk: false, protection: expect.any(Number) });
    expect(later.world.over).toBe(false);
  });

  it("sunk on its last life, the ship is out: it never respawns, and the last ship afloat wins", () => {
    const { world, events } = sinkShip1(duel({ lives: 1 }));
    expect(events).toContainEqual({ type: "sunk", ship: 1, by: 0, cause: "shot", livesLeft: 0 });
    expect(events).toContainEqual({ type: "crewOut", ship: 1 });
    expect(events).toContainEqual({ type: "matchEnded", winner: 0, reason: "lastAfloat" });
    expect(world.ships[1]).toMatchObject({ sunk: true, out: true, livesLeft: 0, respawnIn: 0 });
    expect(world.over).toBe(true);
  });

  it("with 3 ships the match goes on after one is out, and an out ship is left alone", () => {
    const { world, events } = sinkShip1(duel({ lives: 1, ships: 3 }));
    expect(events).toContainEqual({ type: "crewOut", ship: 1 });
    expect(world.over).toBe(false);

    // Shots pass where ship 1 was; it never comes back.
    const later = run(world, TUNING.respawn.delay + 1, () => [fireEast, idle, idle]);
    expect(later.events.filter((e) => e.type === "hit" || e.type === "respawned")).toEqual([]);
    expect(later.world.ships[1]).toMatchObject({ sunk: true, out: true });
  });

  it("the last ships going out in the same step is a draw", () => {
    const world = duel({ lives: 1 });
    world.ships[0] = { ...world.ships[0]!, health: 1 };
    world.ships[1] = { ...world.ships[1]!, health: 1 };
    const ram = (w: World): ShipInput[] => [
      { ...idle, pilot: { steer: { x: 1, y: 0 }, boost: !w.over } },
      { ...idle, pilot: { steer: { x: -1, y: 0 }, boost: !w.over } },
    ];
    const { world: after, events } = run(world, 1.5, ram);
    expect(events.filter((e) => e.type === "sunk").map((e) => e.type === "sunk" && e.cause)).toEqual(["bump", "bump"]);
    expect(events).toContainEqual({ type: "matchEnded", winner: null, reason: "lastAfloat" });
    expect(after.ships.every((s) => s.out)).toBe(true);
  });

  it("Sink Count ships never lose lives or go out", () => {
    const world = createWorld();
    world.ships[0] = { ...world.ships[0]!, pos: { x: 400, y: 200 }, heading: 0, turret: 0 };
    world.ships[1] = { ...world.ships[1]!, pos: { x: 600, y: 200 } };
    const { world: after, events } = sinkShip1(world);
    expect(events.filter((e) => e.type === "sunk")).toEqual([{ type: "sunk", ship: 1, by: 0, cause: "shot" }]);
    expect(after.ships[1]).toMatchObject({ livesLeft: null, out: false });
    expect(after.over).toBe(false);
  });
});

describe("Last Afloat: time limit", () => {
  const atLimit = (setUp: (w: World) => void, ships?: 2 | 3) => {
    const world = { ...createWorld({ mode: "lastAfloat", lives: 3, ships }), time: L.duration - DT };
    setUp(world);
    return step(world, [], DT);
  };

  it(`ends at ${L.duration} s: most lives left wins`, () => {
    const { world, events } = atLimit((w) => { w.ships[0]!.livesLeft = 1; w.ships[1]!.health = 10; });
    expect(world.over).toBe(true);
    expect(events).toContainEqual({ type: "matchEnded", winner: 1, reason: "time" });
  });

  it("equal lives: most health wins (a ship waiting to respawn has none)", () => {
    expect(atLimit((w) => { w.ships[1]!.health = 60; }).events).toContainEqual({ type: "matchEnded", winner: 0, reason: "time" });
    expect(atLimit((w) => { w.ships[0] = { ...w.ships[0]!, health: 0, sunk: true, respawnIn: 1 }; }).events)
      .toContainEqual({ type: "matchEnded", winner: 1, reason: "time" });
  });

  it("equal lives and health is a draw; an out ship can't win it", () => {
    expect(atLimit(() => {}).events).toContainEqual({ type: "matchEnded", winner: null, reason: "time" });
    const three = atLimit((w) => {
      w.ships[2] = { ...w.ships[2]!, livesLeft: 0, out: true, sunk: true, health: 0 };
      w.ships[0]!.livesLeft = 1;
    }, 3);
    expect(three.events).toContainEqual({ type: "matchEnded", winner: 1, reason: "time" });
  });

  it("does not end Last Afloat at Sink Count's time", () => {
    const world = { ...createWorld({ mode: "lastAfloat" }), time: TUNING.match.duration };
    expect(step(world, [], DT).world.over).toBe(false);
  });
});

describe("matchResult in Last Afloat", () => {
  it("the only ship still in wins, whatever the sinkings", () => {
    const world = createWorld({ mode: "lastAfloat", ships: 3 });
    world.ships[0] = { ...world.ships[0]!, out: true, livesLeft: 0, sinkings: 5 };
    world.ships[2] = { ...world.ships[2]!, out: true, livesLeft: 0 };
    expect(matchResult(world)).toEqual({ winner: 1, sinkings: [5, 0, 0] });
  });
});
