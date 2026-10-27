import { CREWS, RejectReason, type Crew, type Role, type Seat } from "@sink-or-sail/shared";
import type { SeatMap } from "./seats.ts";

/**
 * Stage 3 crew pairing. Every player is in a crew (a seat); `waiting` holds, for each crew with one player,
 * when it started waiting for a partner (a counter: lower has waited longer).
 */
export interface CrewRoster {
  seats: SeatMap;
  waiting: ReadonlyMap<number, number>;
}

export type CrewResult = { ok: true; roster: CrewRoster } | { ok: false; reason: RejectReason };

const otherRole = (role: Role): Role => (role === "pilot" ? "gunner" : "pilot");

/** Each crew's players (by session id), for crews with anyone in them. */
function members(seats: SeatMap): Map<number, string[]> {
  const crews = new Map<number, string[]>();
  for (const [id, seat] of seats) {
    if (seat) crews.set(seat.crew, [...(crews.get(seat.crew) ?? []), id]);
  }
  return crews;
}

/** Crews with one player, longest waiting first (ties: lower crew number first). */
function waitingCrews(roster: CrewRoster, except: number | null): number[] {
  const crews = members(roster.seats);
  return [...crews.entries()]
    .filter(([crew, ids]) => ids.length === 1 && crew !== except)
    .map(([crew]) => crew)
    .sort((a, b) => (roster.waiting.get(a) ?? Infinity) - (roster.waiting.get(b) ?? Infinity) || a - b);
}

/** A crew with one player waits from `now` (unless it already was); a crew that is full or empty no longer waits. */
export function refreshWaiting(roster: CrewRoster, now: number): CrewRoster {
  const waiting = new Map<number, number>();
  for (const [crew, ids] of members(roster.seats)) {
    if (ids.length === 1) waiting.set(crew, roster.waiting.get(crew) ?? now);
  }
  return { seats: roster.seats, waiting };
}

/** Moves a player into `crew`'s free role (the crew must have exactly one player, not counting them). */
function intoCrew(roster: CrewRoster, id: string, crew: number, now: number): CrewRoster {
  const partner = members(roster.seats).get(crew)!.find((p) => p !== id)!;
  const role = otherRole(roster.seats.get(partner)!.role);
  const seats = new Map(roster.seats);
  seats.set(id, { crew: crew as Crew, role });
  return refreshWaiting({ seats, waiting: roster.waiting }, now);
}

/** The lowest crew number nobody is in, or null when all three are in use. */
function freeCrew(seats: SeatMap): number | null {
  const used = members(seats);
  return CREWS.find((crew) => !used.has(crew)) ?? null;
}

/**
 * A player who joins (seat null): into the crew that has waited longest for a partner, in its free role; with
 * none waiting, a new crew of their own in `role` (pilot unless asked). During a match they always wait without
 * a crew until the next round (slice 3).
 */
export function placeJoiner(roster: CrewRoster, id: string, now: number, matchOn: boolean, role: Role = "pilot"): CrewRoster {
  const seats = new Map(roster.seats);
  if (matchOn) {
    seats.set(id, null);
    return { seats, waiting: roster.waiting };
  }
  const waiting = waitingCrews(roster, null);
  if (waiting.length > 0) return intoCrew(roster, id, waiting[0]!, now);
  const crew = freeCrew(roster.seats);
  seats.set(id, crew === null ? null : { crew: crew as Crew, role });
  return refreshWaiting({ seats, waiting: roster.waiting }, now);
}

/** A player waiting out a match: the role they chose for the next round, and who they paired with ("" for nobody). */
export interface Waiter {
  id: string;
  role: Role;
  partner: string;
}

/**
 * When a match ends, players who waited it out get crews (in the order given): a pair who chose each other starts
 * a new crew together (the first in their chosen role, the other in the other role) if there are fewer than 3
 * crews; otherwise, and for a single player, each is placed like a joiner (their chosen role if they start a crew).
 */
export function seatWaiting(roster: CrewRoster, waiters: readonly Waiter[], now: number): CrewRoster {
  const byId = new Map(waiters.map((w) => [w.id, w]));
  const done = new Set<string>();
  let next = roster;
  for (const waiter of waiters) {
    if (done.has(waiter.id)) continue;
    done.add(waiter.id);
    const partner = byId.get(waiter.partner);
    const paired = partner && partner.partner === waiter.id && !done.has(partner.id);
    const crew = freeCrew(next.seats);
    if (paired && crew !== null) {
      done.add(partner.id);
      const seats = new Map(next.seats);
      seats.set(waiter.id, { crew: crew as Crew, role: waiter.role });
      seats.set(partner.id, { crew: crew as Crew, role: otherRole(waiter.role) });
      next = refreshWaiting({ seats, waiting: next.waiting }, now);
      continue;
    }
    next = placeJoiner(next, waiter.id, now, false, waiter.role);
  }
  return next;
}

/** Find me a partner: into the crew that has waited longest (its free role); refused when nobody waits or you have one. */
export function findPartner(roster: CrewRoster, id: string, now: number): CrewResult {
  const seat = roster.seats.get(id);
  if (!seat) return { ok: false, reason: RejectReason.InvalidSeat };
  if ((members(roster.seats).get(seat.crew) ?? []).length > 1) return { ok: false, reason: RejectReason.AlreadyPaired };
  const waiting = waitingCrews(roster, seat.crew);
  if (waiting.length === 0) return { ok: false, reason: RejectReason.NoPartnerWaiting };
  return { ok: true, roster: intoCrew(roster, id, waiting[0]!, now) };
}

/** Leave this crew: a new crew of your own, keeping your role; refused with 3 crews already, or when you're alone. */
export function leaveCrew(roster: CrewRoster, id: string, now: number): CrewResult {
  const seat = roster.seats.get(id);
  if (!seat) return { ok: false, reason: RejectReason.InvalidSeat };
  if ((members(roster.seats).get(seat.crew) ?? []).length < 2) return { ok: false, reason: RejectReason.AlreadyAlone };
  const crew = freeCrew(roster.seats);
  if (crew === null) return { ok: false, reason: RejectReason.NoFreeCrew };
  const seats = new Map(roster.seats);
  seats.set(id, { crew: crew as Crew, role: seat.role });
  return { ok: true, roster: refreshWaiting({ seats, waiting: roster.waiting }, now) };
}

/** Between matches: renumbers crews to close any gap (keeping their order), so the ships are Crew 1, 2 (and 3). */
export function closeUpCrews(roster: CrewRoster): CrewRoster {
  const used = [...members(roster.seats).keys()].sort((a, b) => a - b);
  const renumber = new Map(used.map((crew, i) => [crew, i]));
  const seats = new Map<string, Seat | null>();
  for (const [id, seat] of roster.seats) seats.set(id, seat ? { crew: renumber.get(seat.crew)! as Crew, role: seat.role } : null);
  const waiting = new Map([...roster.waiting].filter(([crew]) => renumber.has(crew)).map(([crew, t]) => [renumber.get(crew)!, t]));
  return { seats, waiting };
}

/** How many crews have every player ready, out of the crews with anyone in them. */
export function crewsReady(seats: SeatMap, ready: ReadonlySet<string>): { ready: number; crews: number } {
  const crews = [...members(seats).values()];
  return { ready: crews.filter((ids) => ids.every((id) => ready.has(id))).length, crews: crews.length };
}
