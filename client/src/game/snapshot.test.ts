import { describe, expect, it } from "vitest";
import { snapshotFromState } from "./snapshot.ts";

describe("snapshotFromState", () => {
  it("copies ships and shots out of the synced room state", () => {
    const ship = { x: 1, y: 2, heading: 3, turret: 4, health: 50, energy: 60, boosting: true, shielding: false, protection: 0, sunk: false, respawnIn: 0, sinkings: 2, sunkBy: 1, hits: 3, held: "mine" };
    const state = { ships: [ship], shots: new Map([["7", { x: 9, y: 8, angle: 1 }]]), packs: new Map([["2", { x: 800, y: 150, type: "emp", signalled: true }]]) };
    const snap = snapshotFromState(state, 1234);
    expect(snap.t).toBe(1234);
    expect(snap.ships).toEqual([{ x: 1, y: 2, heading: 3, turret: 4, health: 50, energy: 60, boosting: true, shielding: false, protection: 0, sunk: false, respawnIn: 0, sinkings: 2, sunkBy: 1, hits: 3, held: "mine" }]);
    expect(snap.packs.get("2")).toEqual({ x: 800, y: 150, type: "emp", signalled: true });
    expect(snap.shots.get("7")).toEqual({ x: 9, y: 8, angle: 1 });
    expect(snap.ships[0]).not.toBe(ship);
  });
});

describe("held pack in a snapshot", () => {
  it("reads an empty slot as null", () => {
    const ship = { x: 0, y: 0, heading: 0, turret: 0, health: 100, energy: 100, boosting: false, shielding: false, protection: 0, sunk: false, respawnIn: 0, sinkings: 0, sunkBy: -1, hits: 0, held: "" };
    const snap = snapshotFromState({ ships: [ship], shots: new Map(), packs: new Map() }, 0);
    expect(snap.ships[0]!.held).toBeNull();
  });
});
