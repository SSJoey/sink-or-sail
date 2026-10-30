import { describe, expect, it } from "vitest";
import { CREWS } from "@sink-or-sail/shared";
import { CREW_STYLES, crewFlag } from "./crews.ts";

describe("crew styles", () => {
  // Stage 4 slice 4: chart-toned versions of the Stage 0 colours (approved 2026-10-29).
  it("gives each crew its own colour and symbol", () => {
    expect(CREW_STYLES).toHaveLength(CREWS.length);
    expect(CREW_STYLES[0]).toMatchObject({ colour: 0xc9782a, symbol: "●" });
    expect(CREW_STYLES[1]).toMatchObject({ colour: 0xb0407a, symbol: "■" });
    expect(CREW_STYLES[2]).toMatchObject({ name: "Crew 3", colour: 0x2a7f78, css: "#2A7F78", symbol: "▲" });
  });

  it("never repeats a colour or a symbol", () => {
    expect(new Set(CREW_STYLES.map((s) => s.colour)).size).toBe(CREW_STYLES.length);
    expect(new Set(CREW_STYLES.map((s) => s.symbol)).size).toBe(CREW_STYLES.length);
  });
});

describe("ten crews (Stage 5)", () => {
  it("has the ten agreed colours and symbols", () => {
    expect(CREW_STYLES.map((s) => [s.name, s.css, s.symbol])).toEqual([
      ["Crew 1", "#C9782A", "●"], ["Crew 2", "#B0407A", "■"], ["Crew 3", "#2A7F78", "▲"], ["Crew 4", "#2F5D9E", "◆"], ["Crew 5", "#5E7F2A", "✚"],
      ["Crew 6", "#6E4A9E", "★"], ["Crew 7", "#A33B2B", "▼"], ["Crew 8", "#B8922A", "⬟"], ["Crew 9", "#7A5232", "✖"], ["Crew 10", "#5A6670", "⬢"],
    ]);
    for (const s of CREW_STYLES) expect(s.colour).toBe(parseInt(s.css.slice(1), 16));
  });

  it("each crew's flag on the deck is its symbol's shape, round its spot", () => {
    const at = { x: 100, y: 50 };
    expect(crewFlag(0, at, 4.5)).toEqual({ circle: 4.5 });
    const corners = (crew: number) => (crewFlag(crew, at, 5) as { points: { x: number; y: number }[] }).points.length;
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(corners)).toEqual([4, 3, 4, 12, 10, 3, 5, 12, 6]);
    // Every corner within the flag's size of its spot, and the shape round it.
    for (let crew = 1; crew < 10; crew++) {
      const { points } = crewFlag(crew, at, 5) as { points: { x: number; y: number }[] };
      for (const p of points) expect(Math.hypot(p.x - at.x, p.y - at.y)).toBeLessThanOrEqual(5 * 1.5 + 1e-9);
      expect(points.reduce((s, p) => s + p.x, 0) / points.length).toBeCloseTo(at.x, 0);
    }
    // ▲ points up, ▼ down.
    const up = (crewFlag(2, at, 5) as { points: { y: number }[] }).points;
    const down = (crewFlag(6, at, 5) as { points: { y: number }[] }).points;
    expect(Math.min(...up.map((p) => p.y))).toBeLessThan(at.y - 4);
    expect(Math.max(...down.map((p) => p.y))).toBeGreaterThan(at.y + 4);
  });
});
