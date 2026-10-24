import { describe, expect, it } from "vitest";
import { GAME_NAME } from "@sink-or-sail/shared";
import { DEFAULT_PORT, fixedSeed, resolvePort } from "./config.ts";

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
