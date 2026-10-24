import { describe, expect, it } from "vitest";
import { gunnerFromMouse, pilotFromKeys } from "./laptopInput.ts";

const keys = (k: Partial<{ up: boolean; down: boolean; left: boolean; right: boolean; boost: boolean; pack: boolean }> = {}) => ({
  up: false, down: false, left: false, right: false, boost: false, pack: false, ...k,
});

describe("pilotFromKeys (WASD + Space)", () => {
  it("is still with no keys", () => {
    expect(pilotFromKeys(keys())).toEqual({ steer: { x: 0, y: 0 }, boost: false, pack: false });
  });

  it("maps W/A/S/D to north/west/south/east on screen", () => {
    expect(pilotFromKeys(keys({ up: true })).steer).toEqual({ x: 0, y: -1 });
    expect(pilotFromKeys(keys({ down: true })).steer).toEqual({ x: 0, y: 1 });
    expect(pilotFromKeys(keys({ left: true })).steer).toEqual({ x: -1, y: 0 });
    expect(pilotFromKeys(keys({ right: true })).steer).toEqual({ x: 1, y: 0 });
  });

  it("gives diagonals full length 1, not 1.41", () => {
    const { steer } = pilotFromKeys(keys({ up: true, right: true }));
    expect(steer.x).toBeCloseTo(Math.SQRT1_2);
    expect(steer.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it("cancels opposite keys", () => {
    expect(pilotFromKeys(keys({ left: true, right: true })).steer).toEqual({ x: 0, y: 0 });
  });

  it("boosts with Space", () => {
    expect(pilotFromKeys(keys({ boost: true })).boost).toBe(true);
  });
});

describe("gunnerFromMouse", () => {
  const ship = { x: 100, y: 100 };

  it("aims from the ship toward the mouse", () => {
    const { aim } = gunnerFromMouse({ x: 100, y: 0 }, ship, false, false);
    expect(aim.x).toBeCloseTo(0);
    expect(aim.y).toBeCloseTo(-1);
  });

  it("keeps the last aim (zero vector) with no mouse or the mouse on the ship", () => {
    expect(gunnerFromMouse(null, ship, false, false).aim).toEqual({ x: 0, y: 0 });
    expect(gunnerFromMouse({ x: 100, y: 100 }, ship, false, false).aim).toEqual({ x: 0, y: 0 });
  });

  it("fires on left button and shields on right button", () => {
    expect(gunnerFromMouse(null, ship, true, false)).toMatchObject({ fire: true, shield: false });
    expect(gunnerFromMouse(null, ship, false, true)).toMatchObject({ fire: false, shield: true });
  });
});

describe("the E key (Stage 1)", () => {
  it("presses the Pack button for the pilot", () => {
    expect(pilotFromKeys(keys({ pack: true })).pack).toBe(true);
  });

  it("presses the Pack button for the gunner", () => {
    expect(gunnerFromMouse(null, { x: 0, y: 0 }, false, false, true).pack).toBe(true);
    expect(gunnerFromMouse(null, { x: 0, y: 0 }, false, false).pack).toBe(false);
  });
});
