import { describe, expect, it } from "vitest";
import { gunnerPackBuzz } from "./packBuzz.ts";

describe("gunnerPackBuzz", () => {
  it("buzzes the gunner's phone once when the crew picks up a torpedo", () => {
    expect(gunnerPackBuzz(null, "torpedo", "gunner")).toBe(true);
  });

  it("doesn't buzz again while it's held, or for the pilot", () => {
    expect(gunnerPackBuzz("torpedo", "torpedo", "gunner")).toBe(false);
    expect(gunnerPackBuzz(null, "torpedo", "pilot")).toBe(false);
  });

  it("doesn't buzz for packs that aren't the gunner's to use", () => {
    expect(gunnerPackBuzz(null, "mine", "gunner")).toBe(false);
    expect(gunnerPackBuzz("torpedo", null, "gunner")).toBe(false);
  });
});
