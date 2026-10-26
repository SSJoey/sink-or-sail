import { describe, expect, it } from "vitest";
import { Phase, TUNING } from "@sink-or-sail/shared";
import { canChangeSeat, canEndMatch, canPause, canResume, canSetPacks, canStart, crewHasShip, everyCrewManned, nextHost, readLayout, readOnOff, readReefs, readLives, readMode, shipCount } from "./matchFlow.ts";

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

describe("shipCount (Stage 1 slice 8)", () => {
  it("is 3 when someone sits in Crew 3, otherwise 2", () => {
    expect(shipCount([0, 1])).toBe(2);
    expect(shipCount([0, 2])).toBe(3);
    expect(shipCount([])).toBe(2);
  });
});

describe("everyCrewManned (Stage 2)", () => {
  it("needs a player in each crew that has a ship", () => {
    expect(everyCrewManned([0, 1])).toBe(true);
    expect(everyCrewManned([0, 0, 1])).toBe(true);
    expect(everyCrewManned([0])).toBe(false);
    expect(everyCrewManned([1, 1])).toBe(false);
    expect(everyCrewManned([0, 1, 2])).toBe(true);
    // Crew 3 seated brings a third ship, so Crew 2 must have a player too.
    expect(everyCrewManned([0, 2])).toBe(false);
    expect(everyCrewManned([])).toBe(false);
  });
});

describe("readMode and readLives (Stage 2)", () => {
  it("accepts only { mode } with a known mode", () => {
    expect(readMode({ mode: "lastAfloat" })).toBe("lastAfloat");
    expect(readMode({ mode: "sinkCount" })).toBe("sinkCount");
    for (const bad of [null, "lastAfloat", { mode: "fleet" }, { mode: 1 }, { mode: "sinkCount", extra: 1 }]) expect(readMode(bad)).toBeNull();
  });

  it(`accepts only { lives } with a whole number from ${TUNING.lastAfloat.minLives} to ${TUNING.lastAfloat.maxLives}`, () => {
    expect(readLives({ lives: 1 })).toBe(1);
    expect(readLives({ lives: 5 })).toBe(5);
    for (const bad of [null, 3, { lives: 0 }, { lives: 6 }, { lives: 2.5 }, { lives: "3" }, { lives: Number.NaN }, { lives: 2, extra: 1 }]) expect(readLives(bad)).toBeNull();
  });
});

describe("readLayout (Stage 2)", () => {
  it("accepts only { layout } with a known layout or random", () => {
    expect(readLayout({ layout: "slalom" })).toBe("slalom");
    expect(readLayout({ layout: "oneIsland" })).toBe("oneIsland");
    expect(readLayout({ layout: "random" })).toBe("random");
    for (const bad of [null, "slalom", { layout: "atlantis" }, { layout: 3 }, { layout: "slalom", extra: 1 }]) expect(readLayout(bad)).toBeNull();
  });
});

describe("readReefs and readOnOff (Stage 2 slice 3)", () => {
  it("accepts only { reefs } with none, few or all", () => {
    for (const ok of ["none", "few", "all"] as const) expect(readReefs({ reefs: ok })).toBe(ok);
    for (const bad of [null, "all", { reefs: "lots" }, { reefs: 2 }, { reefs: "all", extra: 1 }]) expect(readReefs(bad)).toBeNull();
  });

  it("accepts only { on } with a boolean", () => {
    expect(readOnOff({ on: true })).toBe(true);
    expect(readOnOff({ on: false })).toBe(false);
    for (const bad of [null, "off", { on: "no" }, { on: false, extra: 1 }]) expect(readOnOff(bad)).toBeNull();
  });
});
