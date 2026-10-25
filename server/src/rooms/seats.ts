import { isSeat, RejectReason, type Seat } from "@sink-or-sail/shared";

/** Each player in the room (by session id) and the seat they hold, if any. */
export type SeatMap = ReadonlyMap<string, Seat | null>;

export type SeatResult =
  | { ok: true; seats: SeatMap }
  | { ok: false; reason: RejectReason };

const sameSeat = (a: Seat, b: Seat) => a.crew === b.crew && a.role === b.role;

export function seatHolder(seats: SeatMap, seat: Seat): string | undefined {
  for (const [sessionId, held] of seats) {
    if (held && sameSeat(held, seat)) return sessionId;
  }
  return undefined;
}

/** Takes a free seat, or switches to it from the player's current seat. */
export function takeSeat(seats: SeatMap, sessionId: string, seat: unknown): SeatResult {
  if (!isSeat(seat) || !seats.has(sessionId)) {
    return { ok: false, reason: RejectReason.InvalidSeat };
  }
  const holder = seatHolder(seats, seat);
  if (holder === sessionId) return { ok: true, seats };
  if (holder !== undefined) return { ok: false, reason: RejectReason.SeatTaken };

  const next = new Map(seats);
  next.set(sessionId, { crew: seat.crew, role: seat.role });
  return { ok: true, seats: next };
}

/** Frees the player's seat; they stay in the room, unseated. */
export function leaveSeat(seats: SeatMap, sessionId: string): SeatResult {
  if (!seats.has(sessionId)) return { ok: false, reason: RejectReason.InvalidSeat };
  if (seats.get(sessionId) === null) return { ok: true, seats };
  const next = new Map(seats);
  next.set(sessionId, null);
  return { ok: true, seats: next };
}

export function isNameTaken(names: Iterable<string>, name: string): boolean {
  const wanted = name.toLowerCase();
  for (const existing of names) {
    if (existing.toLowerCase() === wanted) return true;
  }
  return false;
}
