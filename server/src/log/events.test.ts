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
    expect(lines({ type: "sunk", ship: 0, by: 1, cause: "shot" })).toEqual([{ t: 1234, type: "sunk", ship: 0, crew, by: 1, cause: "shot" }]);
    expect(lines({ type: "respawned", ship: 0, pos: { x: 200.04, y: 180 } })).toEqual([
      { t: 1234, type: "respawn", ship: 0, crew, x: 200, y: 180 },
    ]);
    expect(lines({ type: "protectionEnded", ship: 0 })).toEqual([{ t: 1234, type: "protectionEnded", ship: 0, crew }]);
  });

  it("logs bumps with the damage to each ship", () => {
    expect(lines({ type: "bump", ships: [0, 1], damage: [4.25, 0] })).toEqual([{ t: 1234, type: "bump", ships: [0, 1], damage: [4.3, 0] }]);
  });

  it("leaves the match end to matchEndLine", () => {
    expect(lines({ type: "matchEnded", winner: 0, reason: "time" })).toEqual([]);
  });
});

describe("match start and end", () => {
  it("records the room, crews and roles, and the tuning values in use", () => {
    const line = matchStartLine("KWPZ", roster, { packsOn: false, seed: 7, mode: "sinkCount", lives: null });
    expectBasics(line);
    expect(line).toEqual({
      t: 0,
      type: "matchStart",
      room: "KWPZ",
      crews: [
        { ship: 0, pilot: "Joey", gunner: "Sam" },
        { ship: 1, pilot: "Kim", gunner: null },
      ],
      packsOn: false,
      seed: 7,
      mode: "sinkCount",
      lives: null,
      layout: "oneIsland",
      layoutRandom: false,
      hazardsOn: false,
      reefs: "none",
      wrecks: [],
      storm: null,
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
      reason: "time",
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
    expect(first).toMatchObject({ t: 12346, type: "position", ship: 0, x: 150, y: 450, heading: 0, health: 100, energy: 100, sunk: false, boostEnergy: 0, shieldEnergy: 0, held: [] });
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

describe("Stage 1 pack lines", () => {
  const lines = (e: SimEvent) => simEventLines(4000, [e], roster);
  const crew = { pilot: "Joey", gunner: "Sam" };

  it("records signalled and spawned packs with their spot and type", () => {
    expect(lines({ type: "packSignalled", pack: 2, spot: 4, packType: "emp" })).toEqual([{ t: 4000, type: "packSignalled", pack: 2, spot: 4, packType: "emp" }]);
    expect(lines({ type: "packSpawned", pack: 2, spot: 4, packType: "emp" })).toEqual([{ t: 4000, type: "packSpawned", pack: 2, spot: 4, packType: "emp" }]);
  });

  it("records a pack that disappeared unpicked, with its spot and type", () => {
    expect(lines({ type: "packExpired", pack: 2, spot: 4, packType: "emp" })).toEqual([{ t: 4000, type: "packExpired", pack: 2, spot: 4, packType: "emp" }]);
  });

  it("records pickups, lost packs and health restored, with the crew", () => {
    expect(lines({ type: "packPickedUp", ship: 0, pack: 2, packType: "mine" })).toEqual([{ t: 4000, type: "packPickedUp", ship: 0, crew, pack: 2, packType: "mine" }]);
    expect(lines({ type: "packLost", ship: 0, packType: "mine" })).toEqual([{ t: 4000, type: "packLost", ship: 0, crew, packType: "mine" }]);
    expect(lines({ type: "healthRestored", ship: 0, amount: 33.333 })).toEqual([{ t: 4000, type: "healthRestored", ship: 0, crew, amount: 33.3 }]);
  });

  it("lists all three crews at match start in a 3-ship match", () => {
    const three: Roster = [...roster, { pilot: "Eve", gunner: null }];
    expect(matchStartLine("TRIO", three, { packsOn: true, seed: 1, mode: "sinkCount", lives: null })).toMatchObject({
      crews: [{ ship: 0 }, { ship: 1 }, { ship: 2, pilot: "Eve", gunner: null }],
    });
  });

  it("records whether packs were on and the seed at match start", () => {
    expect(matchStartLine("KWPZ", roster, { packsOn: true, seed: 99, mode: "sinkCount", lives: null })).toMatchObject({ packsOn: true, seed: 99 });
  });

  it("includes each ship's held packs in the position lines, as a list (pilot's first)", () => {
    const world = createWorld({ packs: true, seed: 1 });
    world.ships[0] = { ...world.ships[0]!, pilotPack: "mine", gunnerPack: "torpedo" };
    world.ships[1] = { ...world.ships[1]!, gunnerPack: "emp" };
    expect(positionLines(world).map((l) => l.held)).toEqual([["mine", "torpedo"], ["emp"]]);
    expect(positionLines(createWorld()).map((l) => l.held)).toEqual([[], []]);
  });
});

describe("Stage 1 mine lines", () => {
  const lines = (e: SimEvent) => simEventLines(5000, [e], roster);

  it("records the pack used with the player and role", () => {
    expect(lines({ type: "packUsed", ship: 0, packType: "mine", role: "pilot" })).toEqual([{ t: 5000, type: "packUsed", ship: 0, player: "Joey", role: "pilot", packType: "mine" }]);
  });

  it("records drop, arming and expiry", () => {
    expect(lines({ type: "mineDropped", mine: 3, owner: 0, pos: { x: 350.04, y: 300 } })).toEqual([{ t: 5000, type: "mineDropped", mine: 3, ship: 0, x: 350, y: 300 }]);
    expect(lines({ type: "mineArmed", mine: 3, owner: 0 })).toEqual([{ t: 5000, type: "mineArmed", mine: 3, owner: 0 }]);
    expect(lines({ type: "mineExpired", mine: 3, owner: 0 })).toEqual([{ t: 5000, type: "mineExpired", mine: 3, owner: 0 }]);
  });

  it("records a mine going off: owner, who set it off, each ship hit, damage and whether it was the owner's own ship", () => {
    expect(lines({ type: "mineTriggered", mine: 3, owner: 0, shooter: 1, hits: [{ ship: 0, damage: 20, ownMine: true }, { ship: 1, damage: 40, ownMine: false }] })).toEqual([
      { t: 5000, type: "mineTriggered", mine: 3, owner: 0, setOffBy: "shot", shooter: 1, hits: [{ ship: 0, damage: 20, ownMine: true }, { ship: 1, damage: 40, ownMine: false }] },
    ]);
    expect(lines({ type: "mineTriggered", mine: 4, owner: 1, shooter: null, hits: [] })[0]).toMatchObject({ setOffBy: "ship", shooter: null, hits: [] });
  });
});

describe("Stage 1 torpedo lines", () => {
  const lines = (e: SimEvent) => simEventLines(6000, [e], roster);

  it("records a torpedo fired, with the gunner", () => {
    expect(lines({ type: "packUsed", ship: 0, packType: "torpedo", role: "gunner" })).toEqual([{ t: 6000, type: "packUsed", ship: 0, player: "Sam", role: "gunner", packType: "torpedo" }]);
    expect(lines({ type: "torpedoFired", torpedo: 1, owner: 0, pos: { x: 330.04, y: 200 }, heading: 0.12345 })).toEqual([{ t: 6000, type: "torpedoFired", torpedo: 1, ship: 0, x: 330, y: 200, heading: 0.123 }]);
  });

  it("records a hit: attacker (with the gunner), target, damage, whether the shield halved it", () => {
    expect(lines({ type: "torpedoHit", torpedo: 1, attacker: 0, target: 1, damage: 25, shieldHalved: true })).toEqual([
      { t: 6000, type: "torpedoHit", torpedo: 1, ship: 0, player: "Sam", role: "gunner", target: 1, damage: 25, shieldHalved: true },
    ]);
  });

  it("records a torpedo that ended without a hit, and why", () => {
    expect(lines({ type: "torpedoEnded", torpedo: 1, owner: 0, reason: "edge" })).toEqual([{ t: 6000, type: "torpedoEnded", torpedo: 1, ship: 0, reason: "edge" }]);
  });
});

describe("Stage 1 EMP line", () => {
  it("records the firing ship (with the gunner) and the ships caught", () => {
    expect(simEventLines(7000, [{ type: "empFired", ship: 0, caught: [1] }], roster)).toEqual([
      { t: 7000, type: "empFired", ship: 0, player: "Sam", role: "gunner", caught: [1] },
    ]);
  });
});

describe("Stage 2: Last Afloat lines", () => {
  const crew = { pilot: "Joey", gunner: "Sam" };
  const lines = (e: SimEvent) => simEventLines(1234, [e], roster);

  it("records hazards and reefs at match start, and logs reef hits", () => {
    expect(matchStartLine("KWPZ", roster, { packsOn: true, seed: 1, mode: "sinkCount", lives: null, hazardsOn: true, reefs: "few" })).toMatchObject({ hazardsOn: true, reefs: "few" });
    expect(lines({ type: "reefHit", ship: 0, damage: 5 })).toEqual([{ t: 1234, type: "reefHit", ship: 0, crew, damage: 5 }]);
  });

  it("records the wrecks at match start (where, and the pack each holds), and logs wreck events", () => {
    const wrecks = createWorld({ hazards: true, packs: true, seed: 3 }).wrecks.map((w, i) => ({ ...w, pack: i === 1 ? ("emp" as const) : null }));
    expect(matchStartLine("KWPZ", roster, { packsOn: true, seed: 3, mode: "sinkCount", lives: null, hazardsOn: true, reefs: "all", wrecks }).wrecks).toEqual(
      wrecks.map((w) => ({ wreck: w.id, x: Math.round(w.pos.x * 10) / 10, y: Math.round(w.pos.y * 10) / 10, pack: w.pack })),
    );
    expect(lines({ type: "wreckHit", wreck: 2, by: 0, weapon: "shot", damage: 20 })).toEqual([{ t: 1234, type: "wreckHit", wreck: 2, ship: 0, crew, weapon: "shot", damage: 20 }]);
    expect(lines({ type: "wreckHit", wreck: 2, by: 0, weapon: "bump", damage: 19.71, shipDamage: 6.57 })).toEqual([
      { t: 1234, type: "wreckHit", wreck: 2, ship: 0, crew, weapon: "bump", damage: 19.7, shipDamage: 6.6 },
    ]);
    expect(lines({ type: "wreckDestroyed", wreck: 2, by: 0 })).toEqual([{ t: 1234, type: "wreckDestroyed", wreck: 2, ship: 0, crew }]);
    expect(lines({ type: "wreckDestroyed", wreck: 2, by: null })).toEqual([{ t: 1234, type: "wreckDestroyed", wreck: 2, ship: null, crew: null }]);
    expect(lines({ type: "wreckPackReleased", wreck: 2, pack: 7, packType: "emp" })).toEqual([{ t: 1234, type: "wreckPackReleased", wreck: 2, pack: 7, packType: "emp" }]);
    expect(lines({ type: "packExpired", pack: 7, spot: null, packType: "emp" })).toEqual([{ t: 1234, type: "packExpired", pack: 7, spot: null, packType: "emp" }]);
  });

  it("records the closing storm's times at match start (null without one), and logs storm lines", () => {
    expect(matchStartLine("KWPZ", roster, { packsOn: true, seed: 1, mode: "lastAfloat", lives: 2, hazardsOn: true, storm: { startsAt: 60, closedAt: 300 } }).storm).toEqual({ startsAt: 60, closedAt: 300 });
    expect(lines({ type: "stormStarted" })).toEqual([{ t: 1234, type: "stormStarted" }]);
    expect(lines({ type: "stormClosed" })).toEqual([{ t: 1234, type: "stormClosed" }]);
    expect(lines({ type: "stormDamage", ship: 0, damage: 5 })).toEqual([{ t: 1234, type: "stormDamage", ship: 0, crew, damage: 5 }]);
  });

  it("records the layout at match start, and whether Random picked it", () => {
    expect(matchStartLine("KWPZ", roster, { packsOn: true, seed: 1, mode: "sinkCount", lives: null, layout: "wall", layoutRandom: true })).toMatchObject({ layout: "wall", layoutRandom: true });
  });

  it("records the mode and lives at match start", () => {
    expect(matchStartLine("KWPZ", roster, { packsOn: true, seed: 1, mode: "lastAfloat", lives: 3 })).toMatchObject({ mode: "lastAfloat", lives: 3 });
  });

  it("logs a sinking's cause, the lives left (Last Afloat only) and a crew going out", () => {
    expect(lines({ type: "sunk", ship: 0, by: null, cause: "ownMine", livesLeft: 1 })).toEqual([
      { t: 1234, type: "sunk", ship: 0, crew, by: null, cause: "ownMine", livesLeft: 1 },
    ]);
    expect(lines({ type: "crewOut", ship: 0 })).toEqual([{ t: 1234, type: "crewOut", ship: 0, crew }]);
  });

  it("records why the match ended, and each ship's lives left", () => {
    const world = createWorld({ mode: "lastAfloat", lives: 2 });
    world.time = 95.5;
    world.ships[1] = { ...world.ships[1]!, livesLeft: 0, out: true };
    expect(matchEndLine(world, 0, false)).toMatchObject({
      t: 95500, winner: 0, endedEarly: false, reason: "lastAfloat",
      scores: [{ ship: 0, sinkings: 0, livesLeft: 2 }, { ship: 1, livesLeft: 0 }],
    });
    world.ships[1] = { ...world.ships[1]!, livesLeft: 1, out: false };
    expect(matchEndLine({ ...world, time: 420 }, 0, false)).toMatchObject({ reason: "time" });
    expect(matchEndLine(world, null, true)).toMatchObject({ reason: "endedEarly" });
  });
});
