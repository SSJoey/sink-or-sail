import { SHIP_TYPE_NAMES, TUNING, isShipType, shipTypePicker, type Role, type ShipType } from "@sink-or-sail/shared";
import { CREW_STYLES } from "../game/crews.ts";

/** A player as the lobby sees them (Stage 3 crews). */
export interface LobbyPlayer {
  id: string;
  name: string;
  crew?: number;
  role?: string;
  ready: boolean;
  connected: boolean;
  /** Stage 3 slice 9: a partner bot. */
  bot?: boolean;
  /** Stage 5: the ship type this player picks (used when they're their crew's picker). */
  shipType?: string;
}

export interface CrewRow {
  crew: number;
  /** The crew's symbol and name, e.g. "● Crew 1". */
  label: string;
  colour: string;
  /** Its players, pilot first: "Ana ★ & Ben", "Sam (you)", "Kim (reconnecting)". */
  names: string;
  /** "Ready", "Not ready", or "Needs a gunner" / "Needs a pilot" for a crew with one player. */
  status: string;
  /** The free role this player can Join, or null. */
  join: Role | null;
  /** Stage 5: the crew's ship type's name. */
  ship: string;
}

const styleOf = (crew: number) => CREW_STYLES[crew] ?? CREW_STYLES[0];
const labelOf = (crew: number) => `${styleOf(crew).symbol} ${styleOf(crew).name}`;
const otherRole = (role: string | undefined): Role => (role === "pilot" ? "gunner" : "pilot");

function nameOf(player: LobbyPlayer, hostId: string, myId: string): string {
  return player.name + (player.id === hostId ? " ★" : "") + (player.id === myId ? " (you)" : "") + (player.connected ? "" : " (reconnecting)");
}

/** Stage 5: a crew's picker (see shipTypePicker) and the type it sails (a Frigate for a crew of bots). */
function pickOf(members: readonly LobbyPlayer[]): { picker: LobbyPlayer | null; type: ShipType } {
  const pilot = members.find((m) => m.role === "pilot");
  const gunner = members.find((m) => m.role === "gunner");
  const role = shipTypePicker(pilot && { bot: pilot.bot === true }, gunner && { bot: gunner.bot === true });
  const picker = role === "pilot" ? pilot! : role === "gunner" ? gunner! : null;
  return { picker, type: picker && isShipType(picker.shipType) ? picker.shipType : "frigate" };
}

/** Stage 5: a ship type in one line, for picking: "Health 75 · speed 175 · range 450 · fires every 0.3 s". */
export function shipTypeFacts(type: ShipType): string {
  const s = TUNING.shipTypes[type];
  return `Health ${s.maxHealth} · speed ${s.maxSpeed} · range ${s.shotRange} · fires every ${s.fireInterval} s`;
}

function crewsOf(players: readonly LobbyPlayer[]): Map<number, LobbyPlayer[]> {
  const crews = new Map<number, LobbyPlayer[]>();
  for (const player of players) {
    if (player.crew !== undefined) crews.set(player.crew, [...(crews.get(player.crew) ?? []), player]);
  }
  // Pilot first in each crew.
  for (const members of crews.values()) members.sort((a, b) => (a.role === "pilot" ? -1 : 0) - (b.role === "pilot" ? -1 : 0));
  return new Map([...crews].sort(([a], [b]) => a - b));
}

/** The crews in the room, in order, for the list (with Join on a crew with one player that isn't yours). */
export function crewRows(players: readonly LobbyPlayer[], hostId: string, myId: string): CrewRow[] {
  const mine = players.find((pl) => pl.id === myId)?.crew;
  return [...crewsOf(players)].map(([crew, members]) => {
    const alone = members.length === 1;
    const free = alone ? otherRole(members[0]!.role) : null;
    return {
      crew,
      label: labelOf(crew),
      colour: styleOf(crew).css,
      names: members.map((m) => nameOf(m, hostId, myId)).join(" & ") + (isBotShip(members) ? " (bot ship)" : ""),
      status: free ? `Needs a ${free}` : members.every((m) => m.ready) ? "Ready" : "Not ready",
      join: free && crew !== mine ? free : null,
      ship: SHIP_TYPE_NAMES[pickOf(members).type],
    };
  });
}

/** Your crew: its colour, who holds each role, whether you're alone in it (or with a bot), and how many crews there are; null without one. */
export function myCrew(players: readonly LobbyPlayer[], myId: string) {
  const me = players.find((pl) => pl.id === myId);
  if (!me || me.crew === undefined) return null;
  const members = crewsOf(players).get(me.crew) ?? [];
  const holder = (role: Role) => {
    const m = members.find((x) => x.role === role);
    return m ? m.name + (m.id === myId ? " (you)" : "") : null;
  };
  return {
    crew: me.crew,
    label: labelOf(me.crew),
    colour: styleOf(me.crew).css,
    role: me.role as Role,
    pilot: holder("pilot"),
    gunner: holder("gunner"),
    alone: members.length === 1,
    /** Slice 9: the other role is a bot's (for Remove bot). */
    withBot: members.some((m) => m.bot === true),
    /** Stage 5: the crew's ship type, and whether you pick it. */
    shipType: pickOf(members).type,
    picker: pickOf(members).picker?.id === myId,
    crews: crewsOf(players).size,
  };
}

/** Slice 10: a crew of bots only is a bot ship (a partner bot always has a player with it). */
const isBotShip = (members: readonly LobbyPlayer[]) => members.length > 0 && members.every((m) => m.bot === true);

/** How many bot ships are in the crews (as many of the host's as fit). */
export function botShipCount(players: readonly LobbyPlayer[]): number {
  return [...crewsOf(players).values()].filter(isBotShip).length;
}

/** How many crews have every player ready, out of all the crews. */
export function readyCount(players: readonly LobbyPlayer[]): { ready: number; crews: number } {
  const crews = [...crewsOf(players).values()];
  return { ready: crews.filter((members) => members.every((m) => m.ready)).length, crews: crews.length };
}
