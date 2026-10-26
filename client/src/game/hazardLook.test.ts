import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { cloudAlpha, hiddenByStorms, hiddenShips } from "./hazardLook.ts";
import type { HazardView, ShipView } from "./interpolation.ts";

const R = TUNING.movingStorm.radius;
const storm = (phase: string, extra: Partial<HazardView> = {}): HazardView => ({ kind: "movingStorm", phase, x: 400, y: 300, heading: 0, timeLeft: 5, ...extra });
const ship = (x: number, y: number, extra: Partial<ShipView> = {}) => ({ x, y, sunk: false, ...extra }) as ShipView;

describe("what a moving storm hides", () => {
  it("anything whose centre is inside the cloud, while it is active or fading (not while only signalled)", () => {
    const at = (phase: string) => new Map([["0", storm(phase)]]);
    expect(hiddenByStorms({ x: 400 + R - 1, y: 300 }, at("active"))).toBe(true);
    expect(hiddenByStorms({ x: 400 + R + 1, y: 300 }, at("active"))).toBe(false);
    expect(hiddenByStorms({ x: 400, y: 300 }, at("fading"))).toBe(true);
    expect(hiddenByStorms({ x: 400, y: 300 }, at("signalled"))).toBe(false);
    expect(hiddenByStorms({ x: 400, y: 300 }, new Map())).toBe(false);
  });

  it("other crews' ships inside, but never your own (and not sunk ones)", () => {
    const hazards = new Map([["0", storm("active")]]);
    const ships = [ship(400, 300), ship(420, 300), ship(900, 300), ship(400, 310, { sunk: true })];
    expect(hiddenShips(ships, hazards, 0)).toEqual([1]);
    expect(hiddenShips(ships, hazards, 2)).toEqual([0, 1]);
    expect(hiddenShips(ships, hazards, null)).toEqual([0, 1]);
  });
});

describe("the cloud's look", () => {
  it(`is solid while active and fades out over its last ${TUNING.movingStorm.fadeTime} s; nothing while signalled`, () => {
    expect(cloudAlpha(storm("active"))).toBe(1);
    expect(cloudAlpha(storm("fading", { timeLeft: TUNING.movingStorm.fadeTime / 2 }))).toBeCloseTo(0.5);
    expect(cloudAlpha(storm("fading", { timeLeft: 0 }))).toBe(0);
    expect(cloudAlpha(storm("signalled"))).toBe(0);
  });
});
