import { describe, expect, it } from "vitest";
import { isPortrait } from "./phone.ts";

describe("isPortrait", () => {
  it("is true when the screen is taller than wide", () => {
    expect(isPortrait(390, 844)).toBe(true);
    expect(isPortrait(844, 390)).toBe(false);
    expect(isPortrait(500, 500)).toBe(false);
  });
});
