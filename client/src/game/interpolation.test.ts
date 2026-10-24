import { describe, expect, it } from "vitest";
import { SnapshotBuffer, lerpAngle, type Snapshot } from "./interpolation.ts";

const ship = (x: number, heading = 0, extra = {}) => ({ x, y: 0, heading, turret: heading, health: 100, energy: 100, boosting: false, shielding: false, protection: 0, sunk: false, respawnIn: 0, sinkings: 0, sunkBy: -1, hits: 0, held: null, ...extra });
const snap = (t: number, x: number, shots: Record<string, { x: number; y: number; angle: number }> = {}, heading = 0): Snapshot => ({
  t,
  ships: [ship(x, heading)],
  shots: new Map(Object.entries(shots)),
  packs: new Map(),
  mines: new Map(),
});

describe("lerpAngle", () => {
  it("blends the short way round across ±180°", () => {
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(Math.PI, 2);
    expect(lerpAngle(0, 1, 0.25)).toBeCloseTo(0.25);
  });
});

describe("SnapshotBuffer", () => {
  it("returns nothing before the first snapshot", () => {
    expect(new SnapshotBuffer().sample(0)).toBeNull();
  });

  it("blends ship positions between the two snapshots around the render time", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snap(1000, 0));
    buffer.push(snap(1050, 10));
    buffer.push(snap(1100, 30));
    expect(buffer.sample(1025)!.ships[0]!.x).toBeCloseTo(5);
    expect(buffer.sample(1075)!.ships[0]!.x).toBeCloseTo(20);
  });

  it("blends headings the short way round", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snap(0, 0, {}, 3.0));
    buffer.push(snap(100, 0, {}, -3.0));
    expect(Math.abs(buffer.sample(50)!.ships[0]!.heading)).toBeCloseTo(Math.PI, 2);
  });

  it("holds the oldest snapshot before it and the newest after it (no guessing ahead)", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snap(1000, 0));
    buffer.push(snap(1050, 10));
    expect(buffer.sample(900)!.ships[0]!.x).toBe(0);
    expect(buffer.sample(2000)!.ships[0]!.x).toBe(10);
  });

  it("blends shots present in both snapshots, shows new ones where they are, and drops gone ones", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snap(0, 0, { a: { x: 0, y: 0, angle: 0 }, gone: { x: 5, y: 5, angle: 0 } }));
    buffer.push(snap(100, 0, { a: { x: 40, y: 0, angle: 0 }, fresh: { x: 7, y: 7, angle: 1 } }));
    const shots = buffer.sample(50)!.shots;
    expect(shots.get("a")!.x).toBeCloseTo(20);
    expect(shots.get("fresh")).toEqual({ x: 7, y: 7, angle: 1 });
    expect(shots.has("gone")).toBe(false);
  });

  it("takes on/off values from the newer snapshot", () => {
    const buffer = new SnapshotBuffer();
    buffer.push({ t: 0, ships: [ship(0)], shots: new Map(), packs: new Map(), mines: new Map() });
    buffer.push({ t: 100, ships: [ship(0, 0, { shielding: true })], shots: new Map(), packs: new Map(), mines: new Map() });
    expect(buffer.sample(10)!.ships[0]!.shielding).toBe(true);
  });

  it("forgets snapshots older than a second", () => {
    const buffer = new SnapshotBuffer();
    for (let t = 0; t <= 3000; t += 50) buffer.push(snap(t, t));
    expect(buffer.size).toBeLessThanOrEqual(1000 / 50 + 2);
  });

  it("can be cleared for a new match", () => {
    const buffer = new SnapshotBuffer();
    buffer.push(snap(0, 0));
    buffer.clear();
    expect(buffer.sample(0)).toBeNull();
  });
});
