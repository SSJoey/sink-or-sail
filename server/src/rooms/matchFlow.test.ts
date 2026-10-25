import { describe, expect, it } from "vitest";
import { Phase } from "@sink-or-sail/shared";
import { canChangeSeat, canEndMatch, canPause, canResume, canSetPacks, canStart, crewHasShip, nextHost } from "./matchFlow.ts";

describe("canStart", () => {
  it("lets only the host start, and only when no match is on", () => {
    expect(canStart("h", "h", Phase.Waiting)).toBe(true);
    expect(canStart("h", "h", Phase.Over)).toBe(true);
    expect(canStart("x", "h", Phase.Waiting)).toBe(false);
    expect(canStart("h", "h", Phase.Countdown)).toBe(false);
    expect(canStart("h", "h", Phase.Running)).toBe(false);
  });
});

describe("crewHasShip", () => {
  it("opens every crew between matches", () => {
    expect(crewHasShip(Phase.Waiting, 2, 0)).toBe(true);
    expect(crewHasShip(Phase.Over, 2, 2)).toBe(true);
  });

  it("during a match, opens only crews with a ship", () => {
    for (const phase of [Phase.Countdown, Phase.Running, Phase.Paused]) {
      expect(crewHasShip(phase, 1, 2)).toBe(true);
      expect(crewHasShip(phase, 2, 2)).toBe(false);
      expect(crewHasShip(phase, 2, 3)).toBe(true);
    }
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

describe("canPause", () => {
  it("lets any seated player pause during the countdown or match", () => {
    expect(canPause(Phase.Running, true)).toBe(true);
    expect(canPause(Phase.Countdown, true)).toBe(true);
  });

  it("not seatless players, and not when nothing is running", () => {
    expect(canPause(Phase.Running, false)).toBe(false);
    expect(canPause(Phase.Paused, true)).toBe(false);
    expect(canPause(Phase.Waiting, true)).toBe(false);
    expect(canPause(Phase.Over, true)).toBe(false);
  });
});

describe("canResume", () => {
  it("lets only the host resume, and only while paused", () => {
    expect(canResume("h", "h", Phase.Paused)).toBe(true);
    expect(canResume("x", "h", Phase.Paused)).toBe(false);
    expect(canResume("h", "h", Phase.Running)).toBe(false);
  });
});

describe("canEndMatch", () => {
  it("lets only the host end a match that is on or paused", () => {
    for (const phase of [Phase.Countdown, Phase.Running, Phase.Paused]) expect(canEndMatch("h", "h", phase)).toBe(true);
    expect(canEndMatch("x", "h", Phase.Running)).toBe(false);
    expect(canEndMatch("h", "h", Phase.Waiting)).toBe(false);
    expect(canEndMatch("h", "h", Phase.Over)).toBe(false);
  });
});

describe("seats while paused", () => {
  it("stay locked for seated players", () => {
    expect(canChangeSeat(Phase.Paused, true)).toBe(false);
    expect(canChangeSeat(Phase.Paused, false)).toBe(true);
  });
});

describe("canSetPacks", () => {
  it("lets only the host switch packs, and only between matches", () => {
    expect(canSetPacks("h", "h", Phase.Waiting)).toBe(true);
    expect(canSetPacks("h", "h", Phase.Over)).toBe(true);
    expect(canSetPacks("x", "h", Phase.Waiting)).toBe(false);
    for (const phase of [Phase.Countdown, Phase.Running, Phase.Paused]) expect(canSetPacks("h", "h", phase)).toBe(false);
  });
});
