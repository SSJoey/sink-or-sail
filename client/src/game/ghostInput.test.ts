import { describe, expect, it } from "vitest";
import { ghostMessage, ghostSteer } from "./ghostInput.ts";

describe("steering a ghost", () => {
  it("both roles send their direction as the ghost's, with everything else neutral", () => {
    expect(ghostMessage("pilot", { x: 1, y: 0 })).toEqual({ steer: { x: 0, y: 0 }, boost: false, ghost: { x: 1, y: 0 } });
    expect(ghostMessage("gunner", { x: 0, y: -1 })).toEqual({ aim: { x: 0, y: 0 }, fire: false, shield: false, ghost: { x: 0, y: -1 } });
  });

  it("takes the touch stick when pushed, otherwise the WASD keys", () => {
    expect(ghostSteer({ x: 1, y: 0 }, { x: 0, y: 0.5 })).toEqual({ x: 0, y: 0.5 });
    expect(ghostSteer({ x: 1, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 1, y: 0 });
  });
});
