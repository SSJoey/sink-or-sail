import { describe, expect, it } from "vitest";
import { snapshotFromState } from "./snapshot.ts";

describe("snapshotFromState", () => {
  it("copies ships and shots out of the synced room state", () => {
    const ship = { x: 1, y: 2, heading: 3, turret: 4, health: 50, energy: 60, boosting: true, shielding: false, protection: 0, sunk: false, respawnIn: 0, sinkings: 2 };
    const state = { ships: [ship], shots: new Map([["7", { x: 9, y: 8, angle: 1 }]]) };
    const snap = snapshotFromState(state, 1234);
    expect(snap.t).toBe(1234);
    expect(snap.ships).toEqual([{ x: 1, y: 2, heading: 3, turret: 4, health: 50, energy: 60, boosting: true, shielding: false, protection: 0, sunk: false, sinkings: 2 }]);
    expect(snap.shots.get("7")).toEqual({ x: 9, y: 8, angle: 1 });
    expect(snap.ships[0]).not.toBe(ship);
  });
});
