import { describe, expect, it } from "vitest";
import type { Seat } from "@sink-or-sail/shared";
import { isNameTaken, seatHolder, takeSeat, type SeatMap } from "./seats.ts";

const c0pilot: Seat = { crew: 0, role: "pilot" };
const c0gunner: Seat = { crew: 0, role: "gunner" };
const c1pilot: Seat = { crew: 1, role: "pilot" };

describe("seatHolder", () => {
  it("finds who holds a seat, or nobody", () => {
    const seats: SeatMap = new Map([["a", c0pilot], ["b", null]]);
    expect(seatHolder(seats, c0pilot)).toBe("a");
    expect(seatHolder(seats, c0gunner)).toBeUndefined();
  });
});

describe("takeSeat", () => {
  it("lets a seatless player take a free seat", () => {
    const seats: SeatMap = new Map([["a", null]]);
    const result = takeSeat(seats, "a", c0pilot);
    expect(result).toEqual({ ok: true, seats: new Map([["a", c0pilot]]) });
  });

  it("does not change the map it was given", () => {
    const seats: SeatMap = new Map([["a", null]]);
    takeSeat(seats, "a", c0pilot);
    expect(seats.get("a")).toBeNull();
  });

  it("rejects a seat another player holds", () => {
    const seats: SeatMap = new Map([["a", c0pilot], ["b", null]]);
    expect(takeSeat(seats, "b", c0pilot)).toEqual({ ok: false, reason: "seatTaken" });
  });

  it("lets a player switch to another free seat, freeing the old one", () => {
    const seats: SeatMap = new Map([["a", c0pilot], ["b", null]]);
    const result = takeSeat(seats, "a", c1pilot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seats.get("a")).toEqual(c1pilot);
    expect(takeSeat(result.seats, "b", c0pilot).ok).toBe(true);
  });

  it("treats taking your own seat again as fine", () => {
    const seats: SeatMap = new Map([["a", c0pilot]]);
    expect(takeSeat(seats, "a", c0pilot)).toEqual({ ok: true, seats });
  });

  it("rejects malformed seats", () => {
    const seats: SeatMap = new Map([["a", null]]);
    expect(takeSeat(seats, "a", { crew: 10, role: "pilot" })).toEqual({ ok: false, reason: "invalidSeat" });
    expect(takeSeat(seats, "a", { crew: -1, role: "pilot" })).toEqual({ ok: false, reason: "invalidSeat" });
    expect(takeSeat(seats, "a", "pilot")).toEqual({ ok: false, reason: "invalidSeat" });
  });

  it("rejects players who are not in the room", () => {
    const seats: SeatMap = new Map();
    expect(takeSeat(seats, "ghost", c0pilot)).toEqual({ ok: false, reason: "invalidSeat" });
  });
});

describe("isNameTaken", () => {
  it("compares names without regard to case", () => {
    expect(isNameTaken(["Sam", "Alex"], "sam")).toBe(true);
    expect(isNameTaken(["Sam", "Alex"], "ALEX")).toBe(true);
    expect(isNameTaken(["Sam", "Alex"], "Kim")).toBe(false);
    expect(isNameTaken([], "Kim")).toBe(false);
  });
});
