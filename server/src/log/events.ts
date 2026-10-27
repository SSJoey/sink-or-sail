import { DEFAULT_LAYOUT, TUNING, type GameMode, type LayoutId, type ReefAmount, type Role, type Seat, type SimEvent, type StormTimes, type World, type Wreck } from "@sink-or-sail/shared";

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
  /** The crew credited for something, or none. */
  const credited = (ship: number | null) => (ship === null ? { ship: null, crew: null } : crew(ship));
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
      case "sunk": lines.push({ t, type: "sunk", ...crew(e.ship), by: e.by, cause: e.cause, ...(e.livesLeft !== undefined && { livesLeft: e.livesLeft }) }); break;
      case "crewOut": lines.push({ t, type: "crewOut", ...crew(e.ship) }); break;
      case "hauntingTriggered": lines.push({ t, type: "hauntingTriggered", zone: e.zone, hazard: e.hazard, ghosts: e.ghosts }); break;
      case "ghostStarted": lines.push({ t, type: "ghostStarted", ...crew(e.ship), x: r1(e.pos.x), y: r1(e.pos.y) }); break;
      case "reefHit": lines.push({ t, type: "reefHit", ...crew(e.ship), damage: r1(e.damage) }); break;
      case "wreckHit":
        lines.push({ t, type: "wreckHit", wreck: e.wreck, ...credited(e.by), weapon: e.weapon, damage: r1(e.damage), ...(e.shipDamage !== undefined && { shipDamage: r1(e.shipDamage) }) });
        break;
      case "wreckDestroyed": lines.push({ t, type: "wreckDestroyed", wreck: e.wreck, ...credited(e.by) }); break;
      case "wreckPackReleased": lines.push({ t, type: "wreckPackReleased", wreck: e.wreck, pack: e.pack, packType: e.packType }); break;
      case "stormStarted": lines.push({ t, type: "stormStarted" }); break;
      case "stormClosed": lines.push({ t, type: "stormClosed" }); break;
      case "stormDamage": lines.push({ t, type: "stormDamage", ...crew(e.ship), damage: r1(e.damage) }); break;
      case "hazardSignalled":
        lines.push({ t, type: "hazardSignalled", hazard: e.hazard, kind: e.kind, x: r1(e.pos.x), y: r1(e.pos.y), heading: Math.round(e.heading * 1000) / 1000, ...(e.spin !== undefined && { spin: e.spin }) });
        break;
      case "hazardStarted": lines.push({ t, type: "hazardStarted", hazard: e.hazard, kind: e.kind }); break;
      case "hazardEnded": lines.push({ t, type: "hazardEnded", hazard: e.hazard, kind: e.kind, reason: e.reason }); break;
      case "stormEntered": lines.push({ t, type: "stormEntered", ...crew(e.ship), hazard: e.hazard }); break;
      case "stormLeft": lines.push({ t, type: "stormLeft", ...crew(e.ship), hazard: e.hazard }); break;
      case "whirlpoolEntered": lines.push({ t, type: "whirlpoolEntered", ...crew(e.ship), hazard: e.hazard }); break;
      case "whirlpoolLeft": lines.push({ t, type: "whirlpoolLeft", ...crew(e.ship), hazard: e.hazard }); break;
      case "krakenGrab": lines.push({ t, type: "krakenGrab", ...crew(e.ship), hazard: e.hazard }); break;
      case "krakenDamage": lines.push({ t, type: "krakenDamage", ...crew(e.ship), hazard: e.hazard, damage: r1(e.damage) }); break;
      case "krakenReleased": lines.push({ t, type: "krakenReleased", ...crew(e.ship), hazard: e.hazard, reason: e.reason }); break;
      case "krakenHit": lines.push({ t, type: "krakenHit", hazard: e.hazard, ...crew(e.by), weapon: e.weapon, damage: r1(e.damage) }); break;
      case "respawned": lines.push({ t, type: "respawn", ...crew(e.ship), x: r1(e.pos.x), y: r1(e.pos.y) }); break;
      case "bump": lines.push({ t, type: "bump", ships: e.ships, damage: [r1(e.damage[0]), r1(e.damage[1])] }); break;
      case "packSignalled": lines.push({ t, type: "packSignalled", pack: e.pack, spot: e.spot, packType: e.packType }); break;
      case "packSpawned": lines.push({ t, type: "packSpawned", pack: e.pack, spot: e.spot, packType: e.packType }); break;
      case "packExpired": lines.push({ t, type: "packExpired", pack: e.pack, spot: e.spot, packType: e.packType }); break;
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
      case "torpedoFired":
        lines.push({ t, type: "torpedoFired", torpedo: e.torpedo, ship: e.owner, x: r1(e.pos.x), y: r1(e.pos.y), heading: Math.round(e.heading * 1000) / 1000 });
        break;
      case "torpedoHit":
        lines.push({ t, type: "torpedoHit", torpedo: e.torpedo, ...actor(roster, e.attacker, "gunner"), target: e.target, damage: r1(e.damage), shieldHalved: e.shieldHalved });
        break;
      case "empFired": lines.push({ t, type: "empFired", ...actor(roster, e.ship, "gunner"), caught: e.caught }); break;
      case "torpedoEnded": lines.push({ t, type: "torpedoEnded", torpedo: e.torpedo, ship: e.owner, reason: e.reason }); break;
      case "matchEnded": break;
    }
  }
  return lines;
}

export function matchStartLine(room: string, roster: Roster, match: {
  packsOn: boolean; seed: number; mode: GameMode; lives: number | null; layout?: LayoutId; layoutRandom?: boolean; hazardsOn?: boolean; reefs?: ReefAmount;
  /** Stage 2: the match's wrecks (none with hazards off). */
  wrecks?: readonly Wreck[];
  /** Stage 2: the closing storm's times, or null for none. */
  storm?: StormTimes | null;
  /** Stage 2: match seconds to the first dynamic hazard, or null for none. */
  firstHazardAt?: number | null;
}): LogLine {
  return {
    t: 0,
    type: "matchStart",
    room,
    crews: roster.map((c, ship) => ({ ship, pilot: c.pilot, gunner: c.gunner })),
    packsOn: match.packsOn,
    seed: match.seed,
    mode: match.mode,
    lives: match.lives,
    layout: match.layout ?? DEFAULT_LAYOUT,
    layoutRandom: match.layoutRandom ?? false,
    hazardsOn: match.hazardsOn ?? false,
    reefs: match.reefs ?? "none",
    wrecks: (match.wrecks ?? []).map((w) => ({ wreck: w.id, x: r1(w.pos.x), y: r1(w.pos.y), pack: w.pack })),
    storm: match.storm ?? null,
    firstHazardAt: match.firstHazardAt ?? null,
    tuning: TUNING,
  };
}

export function matchEndLine(world: World, winner: number | null, endedEarly: boolean): LogLine {
  return {
    t: matchMs(world.time),
    type: "matchEnd",
    winner,
    endedEarly,
    reason: endedEarly ? "endedEarly" : world.mode === "lastAfloat" && world.ships.filter((s) => !s.out).length <= 1 ? "lastAfloat" : "time",
    scores: world.ships.map((s) => ({
      ship: s.id,
      sinkings: s.sinkings,
      ...(s.livesLeft !== null && { livesLeft: s.livesLeft }),
      boostEnergy: r1(s.boostEnergy),
      shieldEnergy: r1(s.shieldEnergy),
    })),
  };
}

/** The once-a-second snapshot of every ship, then of every hazard on the sea and every ghost that has appeared. */
export function positionLines(world: World): LogLine[] {
  const t = matchMs(world.time);
  const hazards = world.hazards.map((h) => ({ t, type: "hazard", hazard: h.id, kind: h.kind, phase: h.phase, x: r1(h.pos.x), y: r1(h.pos.y) }));
  const ghosts = world.ghosts.filter((g) => g.appearIn <= 0).map((g) => ({ t, type: "ghost", ship: g.ship, x: r1(g.pos.x), y: r1(g.pos.y) }));
  return [...shipPositions(world, t), ...hazards, ...ghosts];
}

function shipPositions(world: World, t: number): LogLine[] {
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
    held: [s.pilotPack, s.gunnerPack].filter((p) => p !== null),
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
