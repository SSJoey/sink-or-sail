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
      case "packSignalled": lines.push({ t, type: "packSignalled", pack: e.pack, spot: e.spot, packType: e.packType }); break;
      case "packSpawned": lines.push({ t, type: "packSpawned", pack: e.pack, spot: e.spot, packType: e.packType }); break;
      case "packPickedUp": lines.push({ t, type: "packPickedUp", ...crew(e.ship), pack: e.pack, packType: e.packType }); break;
      case "packLost": lines.push({ t, type: "packLost", ...crew(e.ship), packType: e.packType }); break;
      case "healthRestored": lines.push({ t, type: "healthRestored", ...crew(e.ship), amount: r1(e.amount) }); break;
      case "packUsed": lines.push({ t, type: "packUsed", ...actor(roster, e.ship, e.role), packType: e.packType }); break;
      case "mineDropped": lines.push({ t, type: "mineDropped", mine: e.mine, ship: e.owner, x: r1(e.pos.x), y: r1(e.pos.y) }); break;
      case "mineArmed": lines.push({ t, type: "mineArmed", mine: e.mine, owner: e.owner }); break;
      case "mineTriggered":
        lines.push({
          t,
          type: "mineTriggered",
          mine: e.mine,
          owner: e.owner,
          setOffBy: e.shooter === null ? "ship" : "shot",
          shooter: e.shooter,
          hits: e.hits.map((h) => ({ ship: h.ship, damage: r1(h.damage), ownMine: h.ownMine })),
        });
        break;
      case "mineExpired": lines.push({ t, type: "mineExpired", mine: e.mine, owner: e.owner }); break;
      case "matchEnded": break;
    }
  }
  return lines;
}

export function matchStartLine(room: string, roster: Roster, match: { packsOn: boolean; seed: number }): LogLine {
  return {
    t: 0,
    type: "matchStart",
    room,
    crews: roster.map((c, ship) => ({ ship, pilot: c.pilot, gunner: c.gunner })),
    packsOn: match.packsOn,
    seed: match.seed,
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
    held: s.held,
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
