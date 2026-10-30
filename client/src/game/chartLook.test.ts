import { describe, expect, it } from "vitest";
import { LAYOUTS, LAYOUT_IDS, SEA_CENTRE, TUNING, circleOverlapsPolygon, closestPointOnSegment, pointInPolygon, type Polygon, type Vec } from "@sink-or-sail/shared";
import { chartMarks, compassSpot, gridLines, inkOutline, offsetPolygon, palmSpots, reefMarks, waveSpots } from "./chartLook.ts";

const C = TUNING.client.chart;
const mirrorX = (p: Vec) => ({ x: 2 * SEA_CENTRE.x - p.x, y: p.y });
const mirrorY = (p: Vec) => ({ x: p.x, y: 2 * SEA_CENTRE.y - p.y });
/** The same set of points, within 0.01. */
const sameSet = (a: readonly Vec[], b: readonly Vec[]) =>
  a.length === b.length && a.every((p) => b.some((q) => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01));

describe("waveSpots (Stage 4 slice 3)", () => {
  for (const id of LAYOUT_IDS) {
    const layout = LAYOUTS[id];
    it(`${layout.name}: every squiggle is in open water, clear of islands, reefs, wrecks, the compass rose and the edge`, () => {
      const spots = waveSpots(layout.islands, layout.reefs, layout.wrecks);
      expect(spots.length).toBeGreaterThan(5);
      for (const p of spots) {
        for (const island of layout.islands) expect(circleOverlapsPolygon(p, C.waveClearance, island)).toBeNull();
        for (const reef of layout.reefs) expect(circleOverlapsPolygon(p, C.waveClearance, reef)).toBeNull();
        for (const w of layout.wrecks) expect(Math.hypot(p.x - w.pos.x, p.y - w.pos.y)).toBeGreaterThan(C.waveClearance + TUNING.wreck.length / 2);
        expect(Math.hypot(p.x - C.compass.x, p.y - C.compass.y)).toBeGreaterThan(C.compass.radius + C.waveClearance);
        expect(p.x).toBeGreaterThan(C.waveClearance);
        expect(p.x).toBeLessThan(TUNING.sea.width - C.waveClearance);
        expect(p.y).toBeGreaterThan(C.waveClearance);
        expect(p.y).toBeLessThan(TUNING.sea.height - C.waveClearance);
      }
    });
  }

  it("is the same every time, so every device draws the same sea", () => {
    const l = LAYOUTS.twinIsles;
    expect(waveSpots(l.islands, l.reefs, l.wrecks)).toEqual(waveSpots(l.islands, l.reefs, l.wrecks));
  });

  it("is mirrored both ways on a mirrored layout (away from the compass rose, which has one corner)", () => {
    const l = LAYOUTS.fourRocks;
    const nearRose = (p: Vec) => [p, mirrorX(p), mirrorY(p), mirrorX(mirrorY(p))].some((q) => Math.hypot(q.x - C.compass.x, q.y - C.compass.y) <= C.compass.radius + C.waveClearance);
    const spots = waveSpots(l.islands, l.reefs, l.wrecks).filter((p) => !nearRose(p));
    expect(sameSet(spots.map(mirrorX), spots)).toBe(true);
    expect(sameSet(spots.map(mirrorY), spots)).toBe(true);
  });
});

describe("palmSpots", () => {
  it("puts palms inside bigger islands only, never too near the coast, at most the set number", () => {
    for (const id of LAYOUT_IDS) {
      for (const island of LAYOUTS[id].islands) {
        const palms = palmSpots(island);
        expect(palms.length).toBeLessThanOrEqual(C.maxPalms);
        for (const p of palms) {
          expect(pointInPolygon(p, island)).toBe(true);
          const edges = island.map((a, i) => closestPointOnSegment(p, a, island[(i + 1) % island.length]!));
          expect(Math.min(...edges.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))).toBeGreaterThanOrEqual(C.palmMargin);
        }
      }
    }
    expect(palmSpots(LAYOUTS.oneIsland.islands[0]!).length).toBeGreaterThan(0);
  });

  it("mirrors with the island", () => {
    // Twin Isles: one island above the middle, its mirror image below.
    const islands = LAYOUTS.twinIsles.islands;
    const [top, bottom] = [islands[0]!, islands[1]!];
    expect(palmSpots(top).length).toBeGreaterThan(0);
    expect(sameSet(palmSpots(top).map(mirrorY), palmSpots(bottom))).toBe(true);
  });
});

describe("reefMarks", () => {
  it("scatters dots and crosses inside each reef, more on bigger reefs", () => {
    for (const id of LAYOUT_IDS) {
      const reefs = LAYOUTS[id].reefs;
      for (const reef of reefs) {
        const marks = reefMarks(reef);
        expect(marks.length).toBeGreaterThan(0);
        for (const m of marks) expect(pointInPolygon(m.pos, reef)).toBe(true);
      }
      if (reefs.length) expect(new Set(reefs.flatMap(reefMarks).map((m) => m.kind))).toEqual(new Set(["dot", "cross"]));
    }
    const small: Polygon = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }];
    const big: Polygon = [{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 240 }, { x: 0, y: 240 }];
    expect(reefMarks(big).length).toBeGreaterThan(reefMarks(small).length);
  });

  it("mirrors with the reef", () => {
    const l = LAYOUTS.fourRocks;
    const all = l.reefs.flatMap((r) => reefMarks(r).map((m) => m.pos));
    expect(sameSet(all.map(mirrorX), all)).toBe(true);
  });
});

describe("outlines and the grid", () => {
  const square: Polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

  it("offsets a polygon outward (the dotted shallows), whichever way round its points go", () => {
    for (const poly of [square, [...square].reverse()]) {
      const out = offsetPolygon(poly, 10);
      for (const p of out) expect(pointInPolygon(p, poly)).toBe(false);
      expect(out.some((p) => Math.abs(p.x + 10) < 0.01 && Math.abs(p.y + 10) < 0.01)).toBe(true);
    }
  });

  it("draws a hand-inked outline that stays within the wobble of the true edge, the same every time", () => {
    const line = inkOutline(square);
    expect(line.length).toBeGreaterThan(square.length * 4);
    for (const p of line) {
      const nearEdge = Math.min(Math.abs(p.x), Math.abs(p.x - 100), Math.abs(p.y), Math.abs(p.y - 100));
      expect(nearEdge).toBeLessThanOrEqual(C.wobble + 1e-9);
    }
    expect(inkOutline(square)).toEqual(line);
  });

  it("grid lines every gridStep across the sea", () => {
    const lines = gridLines();
    expect(lines).toHaveLength(Math.floor((TUNING.sea.width - 1) / C.gridStep) + Math.floor((TUNING.sea.height - 1) / C.gridStep));
  });

  it("counts what the chart layer draws (for the browser tests)", () => {
    const l = LAYOUTS.oneIsland;
    const marks = chartMarks(l.islands, l.reefs, l.wrecks);
    expect(marks.waves).toBe(waveSpots(l.islands, l.reefs, l.wrecks).length);
    expect(marks.palms).toBe(l.islands.flatMap(palmSpots).length);
    expect(marks.reefMarks).toBe(l.reefs.flatMap(reefMarks).length);
  });
});

describe("the chart on a bigger sea (Stage 5)", () => {
  const sea = { width: 3200, height: 1800 };

  it("the compass rose keeps its place from the bottom-right corner", () => {
    expect(compassSpot()).toEqual({ ...TUNING.client.chart.compass });
    expect(compassSpot(sea)).toEqual({ x: 3200 - 110, y: 1800 - 110, radius: TUNING.client.chart.compass.radius });
  });

  it("the grid and the waves cover the whole sea", () => {
    const step = TUNING.client.chart.gridStep;
    expect(gridLines(sea)).toHaveLength((3200 / step - 1) + (1800 / step - 1));
    const waves = waveSpots([], [], [], sea);
    expect(Math.max(...waves.map((w) => w.x))).toBeGreaterThan(3000);
    expect(Math.max(...waves.map((w) => w.y))).toBeGreaterThan(1600);
    expect(waves.length).toBeGreaterThan(3 * waveSpots([], [], []).length);
  });
});
