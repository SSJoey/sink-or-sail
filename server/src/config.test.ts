import { describe, expect, it } from "vitest";
import { GAME_NAME } from "@sink-or-sail/shared";
import { DEFAULT_PORT, firstHazardAt, fixedSeed, fixedStormTimes, resolvePort } from "./config.ts";

describe("server config", () => {
  it("can import from the shared package", () => {
    expect(GAME_NAME).toBe("Sink or Sail");
  });

  it("uses port 2567 when PORT is not set or invalid", () => {
    expect(DEFAULT_PORT).toBe(2567);
    expect(resolvePort({})).toBe(2567);
    expect(resolvePort({ PORT: "abc" })).toBe(2567);
  });

  it("uses PORT when it is set", () => {
    expect(resolvePort({ PORT: "3000" })).toBe(3000);
  });
});

describe("MATCH_SEED", () => {
  it("fixes every match's seed when set to a whole number (for replays and browser tests)", () => {
    expect(fixedSeed({ MATCH_SEED: "13" })).toBe(13);
  });

  it("is ignored when unset or not a whole number", () => {
    expect(fixedSeed({})).toBeNull();
    expect(fixedSeed({ MATCH_SEED: "abc" })).toBeNull();
    expect(fixedSeed({ MATCH_SEED: "-1" })).toBeNull();
  });
});

describe("STORM_STARTS_AT and STORM_CLOSED_AT (browser tests only)", () => {
  it("set the closing storm's times when both are given, in order", () => {
    expect(fixedStormTimes({ STORM_STARTS_AT: "2", STORM_CLOSED_AT: "12" })).toEqual({ startsAt: 2, closedAt: 12 });
  });

  it("are ignored unless both are numbers, not negative, with closing after starting", () => {
    expect(fixedStormTimes({})).toBeNull();
    expect(fixedStormTimes({ STORM_STARTS_AT: "2" })).toBeNull();
    expect(fixedStormTimes({ STORM_STARTS_AT: "x", STORM_CLOSED_AT: "12" })).toBeNull();
    expect(fixedStormTimes({ STORM_STARTS_AT: "-1", STORM_CLOSED_AT: "12" })).toBeNull();
    expect(fixedStormTimes({ STORM_STARTS_AT: "12", STORM_CLOSED_AT: "12" })).toBeNull();
  });
});

describe("HAZARDS_FIRST_AT (browser tests only)", () => {
  it("sets when the first dynamic hazard comes, or turns them off with \"never\"", () => {
    expect(firstHazardAt({ HAZARDS_FIRST_AT: "2" })).toBe(2);
    expect(firstHazardAt({ HAZARDS_FIRST_AT: "never" })).toBeNull();
  });

  it("is ignored (the tuning value) when unset, not a number or negative", () => {
    expect(firstHazardAt({})).toBeUndefined();
    expect(firstHazardAt({ HAZARDS_FIRST_AT: "soon" })).toBeUndefined();
    expect(firstHazardAt({ HAZARDS_FIRST_AT: "-1" })).toBeUndefined();
  });
});
