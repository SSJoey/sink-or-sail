import type { Vec } from "@sink-or-sail/shared";

/**
 * Crew colours and symbols (index = crew). The symbol helps colour-blind players. Stage 4 slice 4: chart-toned.
 * Stage 5: ten crews (approved 2026-10-30).
 */
export const CREW_STYLES = [
  { name: "Crew 1", colour: 0xc9782a, css: "#C9782A", symbol: "●" },
  { name: "Crew 2", colour: 0xb0407a, css: "#B0407A", symbol: "■" },
  { name: "Crew 3", colour: 0x2a7f78, css: "#2A7F78", symbol: "▲" },
  { name: "Crew 4", colour: 0x2f5d9e, css: "#2F5D9E", symbol: "◆" },
  { name: "Crew 5", colour: 0x5e7f2a, css: "#5E7F2A", symbol: "✚" },
  { name: "Crew 6", colour: 0x6e4a9e, css: "#6E4A9E", symbol: "★" },
  { name: "Crew 7", colour: 0xa33b2b, css: "#A33B2B", symbol: "▼" },
  { name: "Crew 8", colour: 0xb8922a, css: "#B8922A", symbol: "⬟" },
  { name: "Crew 9", colour: 0x7a5232, css: "#7A5232", symbol: "✖" },
  { name: "Crew 10", colour: 0x5a6670, css: "#5A6670", symbol: "⬢" },
] as const;

/** A regular shape of `n` corners round `at`, `r` out, the first corner at `start` radians (0 = east, as on screen). */
const regular = (at: Vec, n: number, r: number, start: number): Vec[] =>
  Array.from({ length: n }, (_, i) => ({ x: at.x + r * Math.cos(start + (i * 2 * Math.PI) / n), y: at.y + r * Math.sin(start + (i * 2 * Math.PI) / n) }));

/** A plus of arms `r` long and `w` wide, turned by `turn` radians. */
function plus(at: Vec, r: number, w: number, turn: number): Vec[] {
  const arm = [[w, -w], [w, -r], [-w, -r], [-w, -w], [-r, -w], [-r, w], [-w, w], [-w, r], [w, r], [w, w], [r, w], [r, -w]] as const;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return arm.map(([x, y]) => ({ x: at.x + x * c - y * s, y: at.y + x * s + y * c }));
}

const UP = -Math.PI / 2;

/**
 * A crew's flag on a ship's deck (and on its ghost): its symbol's shape round `at`, about `size` across each way
 * from it. A circle for Crew 1; otherwise the corners of the shape.
 */
export function crewFlag(crew: number, at: Vec, size: number): { circle: number } | { points: Vec[] } {
  switch (crew) {
    case 0: return { circle: size };
    case 1: return { points: [{ x: at.x - size, y: at.y - size }, { x: at.x + size, y: at.y - size }, { x: at.x + size, y: at.y + size }, { x: at.x - size, y: at.y + size }] };
    case 2: return { points: regular({ x: at.x, y: at.y + size * 0.2 }, 3, size * 1.2, UP) };
    case 3: return { points: regular(at, 4, size * 1.3, UP) };
    case 4: return { points: plus(at, size * 1.2, size * 0.4, 0) };
    case 5: return { points: Array.from({ length: 10 }, (_, i) => regular(at, 10, i % 2 === 0 ? size * 1.35 : size * 0.6, UP)[i]!) };
    case 6: return { points: regular({ x: at.x, y: at.y - size * 0.2 }, 3, size * 1.2, -UP) };
    case 7: return { points: regular(at, 5, size * 1.2, UP) };
    case 8: return { points: plus(at, size * 1.3, size * 0.35, Math.PI / 4) };
    default: return { points: regular(at, 6, size * 1.15, 0) };
  }
}
