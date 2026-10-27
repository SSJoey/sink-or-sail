import { describe, expect, it } from "vitest";
import { RejectReason, type Seat } from "@sink-or-sail/shared";
import { closeUpCrews, crewsReady, findPartner, leaveCrew, placeJoiner, refreshWaiting, seatWaiting, type CrewRoster } from "./crews.ts";

/** A roster from "id: crew role" entries (crew numbered from 0; null for no crew) and when crews started waiting. */
function roster(seats: Record<string, Seat | null>, waiting: Record<number, number> = {}): CrewRoster {
  return { seats: new Map(Object.entries(seats)), waiting: new Map(Object.entries(waiting).map(([c, t]) => [Number(c), t])) };
}
const seat = (crew: number, role: "pilot" | "gunner"): Seat => ({ crew: crew as Seat["crew"], role });
const seatsOf = (r: CrewRoster) => Object.fromEntries(r.seats);

describe("placing a player who joins", () => {
  it("starts a new crew, as pilot, when no crew is waiting for a partner", () => {
    const r = placeJoiner(roster({ ana: null }), "ana", 1, false);
    expect(seatsOf(r)).toEqual({ ana: seat(0, "pilot") });
    expect(r.waiting.get(0)).toBe(1);
  });

  it("joins the crew that has waited longest for a partner, in its free role", () => {
    const start = roster({ ana: seat(0, "gunner"), ben: seat(1, "pilot"), cat: null }, { 0: 5, 1: 2 });
    const r = placeJoiner(start, "cat", 9, false);
    expect(r.seats.get("cat")).toEqual(seat(1, "gunner"));
    expect(r.waiting.has(1)).toBe(false);
    expect(r.waiting.get(0)).toBe(5);
  });

  it("so four players who just join make two full crews", () => {
    let r = roster({});
    ["a", "b", "c", "d"].forEach((id, t) => { r = placeJoiner({ ...r, seats: new Map([...r.seats, [id, null]]) }, id, t, false); });
    expect(seatsOf(r)).toEqual({ a: seat(0, "pilot"), b: seat(0, "gunner"), c: seat(1, "pilot"), d: seat(1, "gunner") });
  });

  it("during a match always waits without a crew, even with a crew waiting for a partner (slice 3)", () => {
    const waitingInMatch = roster({ ana: seat(1, "pilot"), ben: seat(0, "pilot"), dan: seat(0, "gunner"), cat: null }, { 1: 3 });
    expect(placeJoiner(waitingInMatch, "cat", 9, true).seats.get("cat")).toBeNull();
  });

  it("starts a new crew in the role asked for", () => {
    expect(placeJoiner(roster({ ana: null }), "ana", 1, false, "gunner").seats.get("ana")).toEqual(seat(0, "gunner"));
  });
});

describe("Find me a partner", () => {
  it("moves you into the crew that has waited longest, in its free role; your old crew closes", () => {
    const start = roster({ ana: seat(0, "pilot"), ben: seat(1, "pilot"), cat: seat(2, "gunner") }, { 0: 1, 1: 4, 2: 2 });
    const r = findPartner(start, "ben", 9);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.roster.seats.get("ben")).toEqual(seat(0, "gunner"));
    expect([...r.roster.waiting.keys()].sort()).toEqual([2]);
  });

  it("takes the free role even if it isn't the one you had", () => {
    const r = findPartner(roster({ ana: seat(0, "pilot"), ben: seat(1, "pilot") }, { 0: 1, 1: 2 }), "ben", 3);
    expect(r.ok && r.roster.seats.get("ben")).toEqual(seat(0, "gunner"));
  });

  it("with nobody waiting, you stay put (the next player to join pairs with you)", () => {
    expect(findPartner(roster({ ana: seat(0, "pilot") }, { 0: 1 }), "ana", 3)).toEqual({ ok: false, reason: RejectReason.NoPartnerWaiting });
  });

  it("isn't for a player who already has a partner", () => {
    const full = roster({ ana: seat(0, "pilot"), ben: seat(0, "gunner"), cat: seat(1, "pilot") }, { 1: 1 });
    expect(findPartner(full, "ana", 3)).toEqual({ ok: false, reason: RejectReason.AlreadyPaired });
  });
});

describe("Leave this crew", () => {
  it("moves you to a new crew of your own, keeping your role; your old crew now waits for a partner", () => {
    const r = leaveCrew(roster({ ana: seat(0, "pilot"), ben: seat(0, "gunner") }), "ben", 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(seatsOf(r.roster)).toEqual({ ana: seat(0, "pilot"), ben: seat(1, "gunner") });
    expect(Object.fromEntries(r.roster.waiting)).toEqual({ 0: 4, 1: 4 });
  });

  it("isn't possible with 3 crews already, or when you're alone in yours", () => {
    const three = roster({ a: seat(0, "pilot"), b: seat(0, "gunner"), c: seat(1, "pilot"), d: seat(2, "pilot") });
    expect(leaveCrew(three, "a", 1)).toEqual({ ok: false, reason: RejectReason.NoFreeCrew });
    expect(leaveCrew(roster({ a: seat(0, "pilot") }), "a", 1)).toEqual({ ok: false, reason: RejectReason.AlreadyAlone });
  });
});

describe("keeping track of crews", () => {
  it("marks a crew as waiting from when it has one player, and unmarks it when full or empty", () => {
    const r = refreshWaiting(roster({ a: seat(0, "pilot"), b: seat(1, "pilot"), c: seat(1, "gunner") }, { 1: 1, 2: 1 }), 7);
    expect(Object.fromEntries(r.waiting)).toEqual({ 0: 7 });
    expect(refreshWaiting(roster({ a: seat(0, "pilot") }, { 0: 2 }), 7).waiting.get(0)).toBe(2);
  });

  it("closes up gaps in the crew numbers, keeping their order (and when each crew started waiting)", () => {
    const r = closeUpCrews(roster({ a: seat(0, "pilot"), c: seat(2, "gunner"), d: seat(2, "pilot") , e: null }, { 0: 3 }));
    expect(seatsOf(r)).toEqual({ a: seat(0, "pilot"), c: seat(1, "gunner"), d: seat(1, "pilot"), e: null });
    expect(Object.fromEntries(r.waiting)).toEqual({ 0: 3 });
    const shifted = closeUpCrews(roster({ c: seat(2, "gunner") }, { 2: 5 }));
    expect(seatsOf(shifted)).toEqual({ c: seat(0, "gunner") });
    expect(Object.fromEntries(shifted.waiting)).toEqual({ 0: 5 });
  });

  it("counts crews whose players are all ready", () => {
    const seats = roster({ a: seat(0, "pilot"), b: seat(0, "gunner"), c: seat(1, "pilot"), d: null }).seats;
    expect(crewsReady(seats, new Set(["a", "b"]))).toEqual({ ready: 1, crews: 2 });
    expect(crewsReady(seats, new Set(["a", "c"]))).toEqual({ ready: 1, crews: 2 });
    expect(crewsReady(seats, new Set(["a", "b", "c", "d"]))).toEqual({ ready: 2, crews: 2 });
  });
});

describe("placing players who waited out a match (slice 3)", () => {
  const w = (id: string, role: "pilot" | "gunner", partner = "") => ({ id, role, partner });

  it("a waiting pair starts a new crew together, the first in the role they chose", () => {
    const start = roster({ a: seat(0, "pilot"), b: seat(0, "gunner"), tom: null, ana: null });
    const r = seatWaiting(start, [w("tom", "gunner", "ana"), w("ana", "gunner", "tom")], 5);
    expect(r.seats.get("tom")).toEqual(seat(1, "gunner"));
    expect(r.seats.get("ana")).toEqual(seat(1, "pilot"));
  });

  it("with 3 crews already, the pair splits up into crews waiting for a partner", () => {
    const start = roster({ a: seat(0, "pilot"), b: seat(1, "pilot"), c: seat(2, "gunner"), tom: null, ana: null }, { 0: 1, 1: 2, 2: 3 });
    const r = seatWaiting(start, [w("tom", "pilot", "ana"), w("ana", "pilot", "tom")], 5);
    expect(r.seats.get("tom")).toEqual(seat(0, "gunner"));
    expect(r.seats.get("ana")).toEqual(seat(1, "gunner"));
  });

  it("a single waiting player is placed like a joiner, in their chosen role when they start a crew", () => {
    const waitingCrew = roster({ a: seat(0, "gunner"), tom: null }, { 0: 1 });
    expect(seatWaiting(waitingCrew, [w("tom", "gunner")], 5).seats.get("tom")).toEqual(seat(0, "pilot"));
    const full = roster({ a: seat(0, "pilot"), b: seat(0, "gunner"), tom: null });
    expect(seatWaiting(full, [w("tom", "gunner")], 5).seats.get("tom")).toEqual(seat(1, "gunner"));
  });

  it("ignores a partner who isn't waiting with them (only a pair that chose each other counts)", () => {
    const start = roster({ a: seat(0, "pilot"), b: seat(0, "gunner"), tom: null, ana: null });
    const r = seatWaiting(start, [w("tom", "pilot", "ana"), w("ana", "pilot")], 5);
    expect(r.seats.get("tom")).toEqual(seat(1, "pilot"));
    expect(r.seats.get("ana")).toEqual(seat(1, "gunner"));
  });
});
