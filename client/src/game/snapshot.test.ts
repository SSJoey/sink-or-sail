import { describe, expect, it } from "vitest";
import { snapshotFromState } from "./snapshot.ts";

describe("snapshotFromState", () => {
  it("copies ships and shots out of the synced room state", () => {
    const ship = { x: 1, y: 2, heading: 3, turret: 4, health: 50, energy: 60, boosting: true, shielding: false, protection: 0, sunk: false, respawnIn: 0, sinkings: 2, sunkBy: 1, hits: 3, pilotPack: "mine", gunnerPack: "emp", disabled: 1.5, empsFired: 2, livesLeft: 1, out: false, sunkCause: "torpedo", stormHits: 2 };
    const state = { ships: [ship], shots: new Map([["7", { x: 9, y: 8, angle: 1 }]]), packs: new Map([["2", { x: 800, y: 150, type: "emp", signalled: true, lifeLeft: 20 }]]), mines: new Map([["5", { x: 350, y: 300, owner: 0, armed: true }]]), torpedoes: new Map([["1", { x: 500, y: 200, angle: 0 }]]), wrecks: new Map([["3", { health: 40, hasPack: true }]]), hazards: new Map([["4", { kind: "whirlpool", phase: "active", x: 600, y: 200, heading: 1, timeLeft: 9, spin: -1 }]]) };
    const snap = snapshotFromState(state, 1234);
    expect(snap.t).toBe(1234);
    expect(snap.ships).toEqual([{ x: 1, y: 2, heading: 3, turret: 4, health: 50, energy: 60, boosting: true, shielding: false, protection: 0, sunk: false, respawnIn: 0, sinkings: 2, sunkBy: 1, hits: 3, pilotPack: "mine", gunnerPack: "emp", disabled: 1.5, empsFired: 2, livesLeft: 1, out: false, sunkCause: "torpedo", stormHits: 2 }]);
    expect(snap.packs.get("2")).toEqual({ x: 800, y: 150, type: "emp", signalled: true, lifeLeft: 20 });
    expect(snap.mines.get("5")).toEqual({ x: 350, y: 300, owner: 0, armed: true });
    expect(snap.torpedoes.get("1")).toEqual({ x: 500, y: 200, angle: 0 });
    expect(snap.shots.get("7")).toEqual({ x: 9, y: 8, angle: 1 });
    expect(snap.wrecks.get("3")).toEqual({ health: 40, hasPack: true });
    expect(snap.hazards.get("4")).toEqual({ kind: "whirlpool", phase: "active", x: 600, y: 200, heading: 1, timeLeft: 9, spin: -1 });
    expect(snap.ships[0]).not.toBe(ship);
  });
});

describe("held packs in a snapshot", () => {
  it("reads an empty slot as null", () => {
    const ship = { x: 0, y: 0, heading: 0, turret: 0, health: 100, energy: 100, boosting: false, shielding: false, protection: 0, sunk: false, respawnIn: 0, sinkings: 0, sunkBy: -1, hits: 0, pilotPack: "", gunnerPack: "torpedo", disabled: 0, empsFired: 0, livesLeft: -1, out: false, sunkCause: "", stormHits: 0 };
    const snap = snapshotFromState({ ships: [ship], shots: new Map(), packs: new Map(), mines: new Map(), torpedoes: new Map(), wrecks: new Map(), hazards: new Map() }, 0);
    expect(snap.ships[0]!.pilotPack).toBeNull();
    expect(snap.ships[0]!.gunnerPack).toBe("torpedo");
  });
});
