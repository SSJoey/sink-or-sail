import { describe, expect, it } from "vitest";
import { frameLimit, sceneDelay } from "./frameLimit.ts";

describe("the test-only frame limit (?fps=…)", () => {
  it("reads a whole number of frames a second from the page address", () => {
    expect(frameLimit("?fps=20")).toBe(20);
    expect(frameLimit("?code=ABCD&fps=30")).toBe(30);
  });

  it("is off (no limit) when absent, not a whole number, or outside 1–60", () => {
    for (const search of ["", "?code=ABCD", "?fps=", "?fps=abc", "?fps=12.5", "?fps=0", "?fps=-5", "?fps=61"]) expect(frameLimit(search)).toBeUndefined();
  });
});

describe("the test-only scene delay (?sceneDelay=…)", () => {
  it("reads whole milliseconds, up to 10 s, from the page address", () => {
    expect(sceneDelay("?fps=20&sceneDelay=4000")).toBe(4000);
    expect(sceneDelay("?sceneDelay=10000")).toBe(10000);
  });

  it("is off (no delay) when absent, not a whole number, or outside 1–10000", () => {
    for (const search of ["", "?fps=20", "?sceneDelay=", "?sceneDelay=abc", "?sceneDelay=1.5", "?sceneDelay=0", "?sceneDelay=10001"]) expect(sceneDelay(search)).toBeUndefined();
  });
});
