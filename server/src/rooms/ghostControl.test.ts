import { describe, expect, it } from "vitest";
import { GhostControl } from "./ghostControl.ts";

describe("which crewmate a ghost follows", () => {
  it("follows the crewmate who changed their direction last", () => {
    const control = new GhostControl();
    control.receive("pilot", { x: 1, y: 0 });
    control.receive("gunner", { x: 0, y: -1 });
    expect(control.steer(["pilot", "gunner"])).toEqual({ x: 0, y: -1 });
    // The pilot keeps sending the same direction: that isn't a new move.
    control.receive("pilot", { x: 1, y: 0 });
    expect(control.steer(["pilot", "gunner"])).toEqual({ x: 0, y: -1 });
    control.receive("pilot", { x: 0, y: 1 });
    expect(control.steer(["pilot", "gunner"])).toEqual({ x: 0, y: 1 });
  });

  it("while the last one to move lets go, follows the other if they're still steering", () => {
    const control = new GhostControl();
    control.receive("pilot", { x: 1, y: 0 });
    control.receive("gunner", { x: 0, y: -1 });
    control.receive("gunner", { x: 0, y: 0 });
    expect(control.steer(["pilot", "gunner"])).toEqual({ x: 1, y: 0 });
    control.receive("pilot", { x: 0, y: 0 });
    expect(control.steer(["pilot", "gunner"])).toEqual({ x: 0, y: 0 });
  });

  it("only counts the crewmates asked about (a player who left doesn't steer), and forgets on clear", () => {
    const control = new GhostControl();
    control.receive("pilot", { x: 1, y: 0 });
    expect(control.steer(["gunner"])).toEqual({ x: 0, y: 0 });
    control.forget("pilot");
    expect(control.steer(["pilot"])).toEqual({ x: 0, y: 0 });
    control.receive("pilot", { x: 1, y: 0 });
    control.clear();
    expect(control.steer(["pilot"])).toEqual({ x: 0, y: 0 });
  });
});
