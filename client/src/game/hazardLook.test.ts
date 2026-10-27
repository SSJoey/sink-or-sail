import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { hazardAlpha, heldShips, hiddenByStorms, hiddenShips, krakenTentacles, whirlpoolArms } from "./hazardLook.ts";
import type { HazardView, ShipView } from "./interpolation.ts";

const R = TUNING.movingStorm.radius;
const storm = (phase: string, extra: Partial<HazardView> = {}): HazardView => ({ kind: "movingStorm", phase, x: 400, y: 300, heading: 0, timeLeft: 5, spin: 0, health: 0, holding: -1, ...extra });
const pool = (phase: string, extra: Partial<HazardView> = {}): HazardView => ({ kind: "whirlpool", phase, x: 400, y: 300, heading: 0, timeLeft: 5, spin: 1, health: 0, holding: -1, ...extra });
const W = TUNING.whirlpool;
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
    expect(hazardAlpha(storm("active"))).toBe(1);
    expect(hazardAlpha(storm("fading", { timeLeft: TUNING.movingStorm.fadeTime / 2 }))).toBeCloseTo(0.5);
    expect(hazardAlpha(storm("fading", { timeLeft: 0 }))).toBe(0);
    expect(hazardAlpha(storm("signalled"))).toBe(0);
  });
});

describe("a whirlpool's look", () => {
  it("hides nothing", () => {
    expect(hiddenByStorms({ x: 400, y: 300 }, new Map([["0", pool("active")]]))).toBe(false);
  });

  it(`shows fully while active and fades out over its last ${W.fadeTime} s; nothing while signalled`, () => {
    expect(hazardAlpha(pool("active"))).toBe(1);
    expect(hazardAlpha(pool("fading", { timeLeft: W.fadeTime / 2 }))).toBeCloseTo(0.5);
    expect(hazardAlpha(pool("signalled"))).toBe(0);
  });

  it("has three spiral arms from the eye to the edge of its reach, turning the way it spins", () => {
    const arms = whirlpoolArms(pool("active"), 0);
    expect(arms).toHaveLength(3);
    for (const arm of arms) {
      expect(Math.hypot(arm[0]!.x - 400, arm[0]!.y - 300)).toBeCloseTo(W.eyeRadius);
      expect(Math.hypot(arm.at(-1)!.x - 400, arm.at(-1)!.y - 300)).toBeCloseTo(W.reach);
    }
    // A moment later the outer end has moved round: clockwise on screen (angle growing) for spin 1, back for -1.
    const turn = (spin: number) => {
      const [a, b] = [whirlpoolArms(pool("active", { spin }), 0)[0]!.at(-1)!, whirlpoolArms(pool("active", { spin }), 0.1)[0]!.at(-1)!];
      return Math.atan2(b.y - 300, b.x - 400) - Math.atan2(a.y - 300, a.x - 400);
    };
    expect(turn(1)).toBeGreaterThan(0);
    expect(turn(-1)).toBeLessThan(0);
  });
});

describe("a kraken's look", () => {
  const K = TUNING.kraken;
  const kraken = (extra: Partial<HazardView> = {}): HazardView => ({ kind: "kraken", phase: "active", x: 400, y: 300, heading: 0, timeLeft: 5, spin: 0, health: K.health, holding: -1, ...extra });

  it("hides nothing", () => {
    expect(hiddenByStorms({ x: 400, y: 300 }, new Map([["0", kraken()]]))).toBe(false);
  });

  it("waves eight tentacles out from its body while hunting", () => {
    const arms = krakenTentacles(kraken(), 0, null);
    expect(arms).toHaveLength(8);
    for (const arm of arms) expect(Math.hypot(arm[0]!.x - 400, arm[0]!.y - 300)).toBeCloseTo(K.bodyRadius * 0.8);
  });

  it("reaches tentacles round the ship it holds", () => {
    const ship = { x: 460, y: 300 };
    const arms = krakenTentacles(kraken({ holding: 1 }), 0, ship);
    const onShip = arms.filter((arm) => Math.hypot(arm.at(-1)!.x - ship.x, arm.at(-1)!.y - ship.y) <= TUNING.ship.radius + 1);
    expect(onShip.length).toBeGreaterThanOrEqual(3);
  });

  it("lists the ships held by an active kraken (for the browser tests)", () => {
    const hazards = new Map([["0", kraken({ holding: 1 })], ["1", kraken({ holding: 0, phase: "fading" })]]);
    expect(heldShips(hazards)).toEqual([1]);
  });
});
