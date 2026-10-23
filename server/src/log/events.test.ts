import { describe, expect, it } from "vitest";
import { TUNING, createWorld, type SimEvent } from "@sink-or-sail/shared";
import { controlLine, matchEndLine, matchStartLine, playerLine, positionLines, seatLine, simEventLines, type Roster } from "./events.ts";

const roster: Roster = [
  { pilot: "Joey", gunner: "Sam" },
  { pilot: "Kim", gunner: null },
];

/** Every log line carries the match time in ms and an event type. */
function expectBasics(line: Record<string, unknown>) {
  expect(typeof line.t).toBe("number");
  expect(Number.isInteger(line.t)).toBe(true);
  expect(typeof line.type).toBe("string");
}

describe("simEventLines", () => {
  const lines = (e: SimEvent) => simEventLines(1234, [e], roster);

  it("names the gunner for shots, hits, shield and blocks", () => {
    expect(lines({ type: "shotFired", ship: 0, shot: 7 })).toEqual([{ t: 1234, type: "shotFired", ship: 0, player: "Sam", role: "gunner" }]);
    expect(lines({ type: "hit", attacker: 0, target: 1, damage: 20 })).toEqual([
      { t: 1234, type: "hit", ship: 0, player: "Sam", role: "gunner", target: 1, damage: 20 },
    ]);
    expect(lines({ type: "shieldRaised", ship: 0 })).toEqual([{ t: 1234, type: "shieldRaised", ship: 0, player: "Sam", role: "gunner" }]);
    expect(lines({ type: "shotBlocked", attacker: 1, target: 0 })).toEqual([
      { t: 1234, type: "shotBlocked", ship: 0, player: "Sam", role: "gunner", attacker: 1 },
    ]);
  });

  it("names the pilot for boost", () => {
    expect(lines({ type: "boostStarted", ship: 1 })).toEqual([{ t: 1234, type: "boostUsed", ship: 1, player: "Kim", role: "pilot" }]);
  });

  it("uses null for an empty seat", () => {
    expect(lines({ type: "shotFired", ship: 1, shot: 1 })[0]).toMatchObject({ player: null, role: "gunner" });
  });

  it("lists both crew members for ship-level events", () => {
    const crew = { pilot: "Joey", gunner: "Sam" };
    expect(lines({ type: "energyEmpty", ship: 0 })).toEqual([{ t: 1234, type: "energyEmpty", ship: 0, crew }]);
    expect(lines({ type: "energyRestored", ship: 0 })).toEqual([{ t: 1234, type: "energyRestored", ship: 0, crew }]);
    expect(lines({ type: "sunk", ship: 0, by: 1 })).toEqual([{ t: 1234, type: "sunk", ship: 0, crew, by: 1 }]);
    expect(lines({ type: "respawned", ship: 0, pos: { x: 200.04, y: 180 } })).toEqual([
      { t: 1234, type: "respawn", ship: 0, crew, x: 200, y: 180 },
    ]);
    expect(lines({ type: "protectionEnded", ship: 0 })).toEqual([{ t: 1234, type: "protectionEnded", ship: 0, crew }]);
  });

  it("logs bumps with the damage to each ship", () => {
    expect(lines({ type: "bump", ships: [0, 1], damage: [4.25, 0] })).toEqual([{ t: 1234, type: "bump", ships: [0, 1], damage: [4.3, 0] }]);
  });

  it("leaves the match end to matchEndLine", () => {
    expect(lines({ type: "matchEnded", winner: 0 })).toEqual([]);
  });
});

describe("match start and end", () => {
  it("records the room, crews and roles, and the tuning values in use", () => {
    const line = matchStartLine("KWPZ", roster);
    expectBasics(line);
    expect(line).toEqual({
      t: 0,
      type: "matchStart",
      room: "KWPZ",
      crews: [
        { ship: 0, pilot: "Joey", gunner: "Sam" },
        { ship: 1, pilot: "Kim", gunner: null },
      ],
      tuning: TUNING,
    });
  });

  it("records scores, energy spent and the winner, and whether the host ended it early", () => {
    const world = createWorld();
    world.time = 240;
    world.ships[0] = { ...world.ships[0]!, sinkings: 3, boostEnergy: 120.44, shieldEnergy: 80 };
    expect(matchEndLine(world, 0, false)).toEqual({
      t: 240000,
      type: "matchEnd",
      winner: 0,
      endedEarly: false,
      scores: [
        { ship: 0, sinkings: 3, boostEnergy: 120.4, shieldEnergy: 80 },
        { ship: 1, sinkings: 0, boostEnergy: 0, shieldEnergy: 0 },
      ],
    });
  });
});

describe("positionLines", () => {
  it("gives each ship's position, heading, health and energy, rounded", () => {
    const world = createWorld();
    world.time = 12.3456;
    const [first] = positionLines(world);
    expectBasics(first!);
    expect(first).toMatchObject({ t: 12346, type: "position", ship: 0, x: 150, y: 450, heading: 0, health: 100, energy: 100, sunk: false, boostEnergy: 0, shieldEnergy: 0 });
    expect(positionLines(world)).toHaveLength(2);
  });
});

describe("player and control lines", () => {
  it("records joins, leaves, drops and reconnects with the seat (if any)", () => {
    expect(playerLine(500, "playerJoined", "Ana", null)).toEqual({ t: 500, type: "playerJoined", player: "Ana", ship: null, role: null });
    expect(playerLine(500, "playerLeft", "Sam", { crew: 0, role: "gunner" })).toEqual({ t: 500, type: "playerLeft", player: "Sam", ship: 0, role: "gunner" });
    expect(playerLine(500, "playerReconnected", "Sam", { crew: 0, role: "gunner" }).type).toBe("playerReconnected");
    expect(playerLine(500, "playerDropped", "Sam", null).type).toBe("playerDropped");
  });

  it("records seats taken mid-match", () => {
    expect(seatLine(900, "Ana", { crew: 1, role: "gunner" })).toEqual({ t: 900, type: "seatTaken", player: "Ana", ship: 1, role: "gunner" });
  });

  it("records pause, resume and an early end, with who did it", () => {
    expect(controlLine(800, "paused", "Sam", { crew: 0, role: "gunner" })).toEqual({ t: 800, type: "paused", player: "Sam", ship: 0, role: "gunner" });
    expect(controlLine(900, "endedEarly", "Joey", null)).toEqual({ t: 900, type: "endedEarly", player: "Joey", ship: null, role: null });
  });
});
