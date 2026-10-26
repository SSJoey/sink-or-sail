import { describe, expect, it } from "vitest";
import { TUNING, pointInPolygon, wreckHull } from "@sink-or-sail/shared";
import { WreckFlashes, wreckCracks, wreckPieces } from "./wreckLook.ts";

const H = TUNING.wreck.health;

describe("a wreck's look", () => {
  it("is a hull broken in two: both pieces inside the hull, with a gap across the middle", () => {
    const spot = { pos: { x: 400, y: 300 }, angle: Math.PI / 6 };
    const hull = wreckHull(spot);
    const [bow, stern] = wreckPieces(spot);
    // Points just inside the pieces' corners are inside the hull (corners on its edge count as touching it).
    for (const piece of [bow!, stern!]) {
      const c = piece.reduce((a, p) => ({ x: a.x + p.x / piece.length, y: a.y + p.y / piece.length }), { x: 0, y: 0 });
      for (const p of piece) expect(pointInPolygon({ x: p.x + (c.x - p.x) * 0.05, y: p.y + (c.y - p.y) * 0.05 }, hull)).toBe(true);
    }
    // The middle of the hull is the gap between the pieces.
    expect(pointInPolygon(spot.pos, bow!)).toBe(false);
    expect(pointInPolygon(spot.pos, stern!)).toBe(false);
  });

  it("shows a crack at 2/3 health and two at 1/3", () => {
    expect([H, H * 0.7, (H * 2) / 3, H * 0.5, H / 3, 1].map(wreckCracks)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it(`flashes for ${TUNING.client.hitFlashMs} ms when its health drops (not when first seen)`, () => {
    const flashes = new WreckFlashes(TUNING.client.hitFlashMs);
    expect(flashes.update("0", H, 0)).toBe(false);
    expect(flashes.update("0", H, 100)).toBe(false);
    expect(flashes.update("0", H - 20, 200)).toBe(true);
    expect(flashes.update("0", H - 20, 200 + TUNING.client.hitFlashMs)).toBe(true);
    expect(flashes.update("0", H - 20, 201 + TUNING.client.hitFlashMs)).toBe(false);
    // A new match's wreck at full health with the same id doesn't flash.
    expect(flashes.update("0", H, 5000)).toBe(false);
  });
});
