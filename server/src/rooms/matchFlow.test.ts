import { describe, expect, it } from "vitest";
import { Phase } from "@sink-or-sail/shared";
import { canChangeSeat, canStart, nextHost } from "./matchFlow.ts";

describe("canStart", () => {
  it("lets only the host start, and only when no match is on", () => {
    expect(canStart("h", "h", Phase.Waiting)).toBe(true);
    expect(canStart("h", "h", Phase.Over)).toBe(true);
    expect(canStart("x", "h", Phase.Waiting)).toBe(false);
    expect(canStart("h", "h", Phase.Countdown)).toBe(false);
    expect(canStart("h", "h", Phase.Running)).toBe(false);
  });
});

describe("canChangeSeat", () => {
  it("allows any seat change between matches", () => {
    expect(canChangeSeat(Phase.Waiting, true)).toBe(true);
    expect(canChangeSeat(Phase.Over, true)).toBe(true);
  });

  it("stops seated players switching during the countdown or match", () => {
    expect(canChangeSeat(Phase.Countdown, true)).toBe(false);
    expect(canChangeSeat(Phase.Running, true)).toBe(false);
  });

  it("lets a seatless player take a free seat mid-match", () => {
    expect(canChangeSeat(Phase.Running, false)).toBe(true);
  });
});

describe("nextHost", () => {
  it("picks the longest-present player", () => {
    expect(nextHost(new Map([["b", 5], ["a", 2], ["c", 9]]))).toBe("a");
  });

  it("is empty when nobody is left", () => {
    expect(nextHost(new Map())).toBe("");
  });
});
