import { describe, expect, it } from "vitest";
import { LAYOUTS, SHIP_TYPES, TUNING } from "@sink-or-sail/shared";
import { HULL_VIEWBOX, hullOutline, layoutOutline } from "./outlines.ts";

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("the picked ship's outline in the lobby (Stage 5 slice 4)", () => {
  it("is a closed path of each type's own hull, bow to the right, inside one shared box", () => {
    const box = HULL_VIEWBOX.split(" ").map(Number);
    for (const type of SHIP_TYPES) {
      const d = hullOutline(type);
      expect(d).toMatch(/^M.*Z$/);
      const xs = numbers(d).filter((_, i) => i % 2 === 0);
      const ys = numbers(d).filter((_, i) => i % 2 === 1);
      expect(Math.max(...xs)).toBeCloseTo(TUNING.shipTypes[type].radius, 0); // the bow
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(box[0]!);
      expect(Math.max(...ys)).toBeLessThanOrEqual(box[1]! + box[3]!);
    }
  });

  it("shows the sizes as they are: an Ironclad is bigger than a Cutter", () => {
    const length = (d: string) => { const xs = numbers(d).filter((_, i) => i % 2 === 0); return Math.max(...xs) - Math.min(...xs); };
    expect(length(hullOutline("ironclad"))).toBeGreaterThan(length(hullOutline("cutter")));
  });
});

describe("the chosen layout's outline in the lobby (Stage 5 slice 4)", () => {
  it("has a path per island, and the reefs the host's setting gives", () => {
    const outline = layoutOutline("twinIsles", true, "all")!;
    expect(outline.islands).toHaveLength(LAYOUTS.twinIsles.islands.length);
    expect(outline.reefs).toHaveLength(LAYOUTS.twinIsles.reefs.length);
    expect(outline.islands[0]).toMatch(/^M.*Z$/);
    expect(layoutOutline("twinIsles", true, "few")!.reefs).toHaveLength(LAYOUTS.twinIsles.fewReefs.length);
  });

  it("has no reefs with hazards off or reefs set to none", () => {
    expect(layoutOutline("oneIsland", false, "all")!.reefs).toEqual([]);
    expect(layoutOutline("oneIsland", true, "none")!.reefs).toEqual([]);
  });

  it("is null for Random (the lobby shows a question mark)", () => {
    expect(layoutOutline("random", true, "all")).toBeNull();
  });
});
