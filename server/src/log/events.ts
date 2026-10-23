import { TUNING, type Role, type Seat, type SimEvent, type World } from "@sink-or-sail/shared";

/** Who crews each ship (index = ship id); null for an empty seat. */
export type Roster = { pilot: string | null; gunner: string | null }[];

/** One line of the match log. Every line has `t` (match time in ms) and `type`. */
export type LogLine = { t: number; type: string } & Record<string, unknown>;

export const matchMs = (seconds: number) => Math.round(seconds * 1000);
const r1 = (n: number) => Math.round(n * 10) / 10;

const crewOf = (roster: Roster, ship: number) => roster[ship] ?? { pilot: null, gunner: null };

/** An action by one crew member: the ship, the player's name and role. */
function actor(roster: Roster, ship: number, role: Role) {
  return { ship, player: crewOf(roster, ship)[role], role };
}

/** Turns one simulation step's events into log lines. The match end is written by matchEndLine. */
export function simEventLines(t: number, events: readonly SimEvent[], roster: Roster): LogLine[] {
  const lines: LogLine[] = [];
  const crew = (ship: number) => ({ ship, crew: { ...crewOf(roster, ship) } });
  for (const e of events) {
    switch (e.type) {
      case "shotFired": lines.push({ t, type: "shotFired", ...actor(roster, e.ship, "gunner") }); break;
      case "hit": lines.push({ t, type: "hit", ...actor(roster, e.attacker, "gunner"), target: e.target, damage: r1(e.damage) }); break;
      case "shieldRaised": lines.push({ t, type: "shieldRaised", ...actor(roster, e.ship, "gunner") }); break;
      case "shotBlocked": lines.push({ t, type: "shotBlocked", ...actor(roster, e.target, "gunner"), attacker: e.attacker }); break;
      case "boostStarted": lines.push({ t, type: "boostUsed", ...actor(roster, e.ship, "pilot") }); break;
      case "energyEmpty": lines.push({ t, type: "energyEmpty", ...crew(e.ship) }); break;
      case "energyRestored": lines.push({ t, type: "energyRestored", ...crew(e.ship) }); break;
      case "protectionEnded": lines.push({ t, type: "protectionEnded", ...crew(e.ship) }); break;
      case "sunk": lines.push({ t, type: "sunk", ...crew(e.ship), by: e.by }); break;
      case "respawned": lines.push({ t, type: "respawn", ...crew(e.ship), x: r1(e.pos.x), y: r1(e.pos.y) }); break;
      case "bump": lines.push({ t, type: "bump", ships: e.ships, damage: [r1(e.damage[0]), r1(e.damage[1])] }); break;
      case "matchEnded": break;
    }
  }
  return lines;
}

export function matchStartLine(room: string, roster: Roster): LogLine {
  return {
    t: 0,
    type: "matchStart",
    room,
    crews: roster.map((c, ship) => ({ ship, pilot: c.pilot, gunner: c.gunner })),
    tuning: TUNING,
  };
}

export function matchEndLine(world: World, winner: number | null, endedEarly: boolean): LogLine {
  return {
    t: matchMs(world.time),
    type: "matchEnd",
    winner,
    endedEarly,
    scores: world.ships.map((s) => ({ ship: s.id, sinkings: s.sinkings, boostEnergy: r1(s.boostEnergy), shieldEnergy: r1(s.shieldEnergy) })),
  };
}

/** The once-a-second snapshot of every ship. */
export function positionLines(world: World): LogLine[] {
  const t = matchMs(world.time);
  return world.ships.map((s) => ({
    t,
    type: "position",
    ship: s.id,
    x: r1(s.pos.x),
    y: r1(s.pos.y),
    heading: Math.round(s.heading * 1000) / 1000,
    health: r1(s.health),
    energy: r1(s.energy),
    sunk: s.sunk,
    boostEnergy: r1(s.boostEnergy),
    shieldEnergy: r1(s.shieldEnergy),
  }));
}

const seatFields = (seat: Seat | null) => ({ ship: seat?.crew ?? null, role: seat?.role ?? null });

export function playerLine(
  t: number,
  type: "playerJoined" | "playerLeft" | "playerDropped" | "playerReconnected",
  player: string,
  seat: Seat | null,
): LogLine {
  return { t, type, player, ...seatFields(seat) };
}

export function seatLine(t: number, player: string, seat: Seat): LogLine {
  return { t, type: "seatTaken", player, ...seatFields(seat) };
}

export function controlLine(t: number, type: "paused" | "resumed" | "endedEarly", player: string, seat: Seat | null): LogLine {
  return { t, type, player, ...seatFields(seat) };
}
