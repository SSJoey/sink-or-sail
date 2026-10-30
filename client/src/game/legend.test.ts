import { describe, expect, it } from "vitest";
import { legendRows, legendShown, loadLegendHidden, saveLegendHidden } from "./legend.ts";

describe("the laptop controls legend (Stage 5 slice 4)", () => {
  it("lists the role's keys", () => {
    expect(legendRows("pilot", false)).toEqual([["W A S D", "Steer"], ["Space", "Boost"], ["E", "Drop the mine"]]);
    expect(legendRows("gunner", false)).toEqual([["Mouse", "Aim"], ["Click", "Fire"], ["Right-click", "Shield"], ["E", "Fire the torpedo or EMP"]]);
  });

  it("a ghost crew: steering only, in both roles", () => {
    expect(legendRows("pilot", true)).toEqual([["W A S D", "Steer your ghost"]]);
    expect(legendRows("gunner", true)).toEqual([["W A S D", "Steer your ghost"]]);
  });

  it("shows on laptops for a crew member during a match, unless hidden", () => {
    const base = { seated: true, playing: true, phone: false, hidden: false };
    expect(legendShown(base)).toBe(true);
    expect(legendShown({ ...base, phone: true })).toBe(false);
    expect(legendShown({ ...base, seated: false })).toBe(false);
    expect(legendShown({ ...base, playing: false })).toBe(false);
    expect(legendShown({ ...base, hidden: true })).toBe(false);
  });

  it("Hide is remembered on the device (and works without storage)", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } as Storage;
    expect(loadLegendHidden(store)).toBe(false);
    saveLegendHidden(store, true);
    expect(loadLegendHidden(store)).toBe(true);
    saveLegendHidden(store, false);
    expect(loadLegendHidden(store)).toBe(false);
    expect(loadLegendHidden(null)).toBe(false);
    expect(() => saveLegendHidden(null, true)).not.toThrow();
  });
});
