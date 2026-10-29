import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { waitingView, type WaitingPlayer } from "./waiting.ts";

const p = (id: string, name: string, crew?: number, extra: Partial<WaitingPlayer> = {}): WaitingPlayer => ({ id, name, crew, nextRole: "pilot", partner: "", ...extra });
const base = { mode: "sinkCount", timeLeft: 125.2, matchStorm: false, stormStartsAt: 0, stormClosedAt: 0, ships: [{ sunk: false }, { sunk: true }, { sunk: false }] };

describe("the waiting screen (Stage 3 slice 3)", () => {
  const players = [p("a", "Ana", 0), p("b", "Ben", 1), p("me", "Me"), p("tom", "Tom"), p("kim", "Kim", undefined, { partner: "lee" }), p("lee", "Lee", undefined, { partner: "kim" })];

  it("counts ships afloat and the others waiting, and shows the time left in Sink Count", () => {
    const view = waitingView({ ...base, players }, "me");
    expect([view.afloat, view.othersWaiting]).toEqual([2, 3]);
    expect(view.clock).toEqual({ value: "2:06", label: "time left" });
  });

  it("in Last Afloat with the storm, shows the time until it closes in, then that it's closing or closed", () => {
    const storm = { ...base, players, mode: "lastAfloat", matchStorm: true, stormStartsAt: 60, stormClosedAt: 300 };
    const at = (elapsed: number) => waitingView({ ...storm, timeLeft: TUNING.lastAfloat.duration - elapsed }, "me").clock;
    expect(at(18)).toEqual({ value: "0:42", label: "until the storm" });
    expect(at(100)).toEqual({ value: "Closing", label: "storm" });
    expect(at(320)).toEqual({ value: "Closed", label: "storm" });
    expect(waitingView({ ...base, players, mode: "lastAfloat", timeLeft: 400 }, "me").clock).toEqual({ value: "6:40", label: "time left" });
  });

  it("offers to pair with each other waiting player who has no partner", () => {
    expect(waitingView({ ...base, players }, "me").pairWith).toEqual([{ id: "tom", name: "Tom" }]);
  });

  it("shows your chosen role and partner", () => {
    const paired = players.map((x) => (x.id === "me" ? { ...x, partner: "tom", nextRole: "gunner" } : x.id === "tom" ? { ...x, partner: "me" } : x));
    const view = waitingView({ ...base, players: paired }, "me");
    expect([view.nextRole, view.partnerName]).toEqual(["gunner", "Tom"]);
    expect(view.pairWith).toEqual([]);
    expect(waitingView({ ...base, players }, "me").partnerName).toBeNull();
  });

  it("shows that you chose Play with a bot for the next round (slice 9)", () => {
    const withBot = players.map((x) => (x.id === "me" ? { ...x, withBot: true } : x));
    expect(waitingView({ ...base, players: withBot }, "me")).toMatchObject({ withBot: true, partnerName: null });
    expect(waitingView({ ...base, players }, "me").withBot).toBe(false);
  });
});
