import { describe, expect, it } from "vitest";
import { frameLimit } from "./frameLimit.ts";

describe("the test-only frame limit (?fps=…)", () => {
  it("reads a whole number of frames a second from the page address", () => {
    expect(frameLimit("?fps=20")).toBe(20);
    expect(frameLimit("?code=ABCD&fps=30")).toBe(30);
  });

  it("is off (no limit) when absent, not a whole number, or outside 1–60", () => {
    for (const search of ["", "?code=ABCD", "?fps=", "?fps=abc", "?fps=12.5", "?fps=0", "?fps=-5", "?fps=61"]) expect(frameLimit(search)).toBeUndefined();
  });
});
