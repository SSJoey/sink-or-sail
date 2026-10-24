import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning.ts";
import { createWorld } from "./match.ts";
import { STAGE0_SCRIPT_DT, STAGE0_SCRIPT_SECONDS, stage0ScriptInputs } from "./stage0Script.ts";
import { step } from "./step.ts";
import type { SimEvent, World } from "./types.ts";
import recording from "./fixtures/stage0-run.json" with { type: "json" };


/**
 * A scripted Stage 0 fight recorded with packs off. First recorded 2026-10-24 before packs existed;
 * re-recorded (with approval) when the energy refill changed to 5 per second. It holds the tuning it was
 * recorded with: any tuning change alters play, so the recording must then be re-recorded, with approval.
 */
const recorded = recording as unknown as { tuning: unknown; world: World; events: SimEvent[] };

/** The Stage 0 fields of a world; later stages add fields that a Stage 0 recording can't contain. */
function stage0View(world: World) {
  const { time, shots, nextShotId, contacts, over } = world;
  const ships = world.ships.map((s) => ({
    id: s.id, pos: s.pos, vel: s.vel, heading: s.heading, turret: s.turret, health: s.health, energy: s.energy,
    energyLocked: s.energyLocked, boosting: s.boosting, shielding: s.shielding, fireCooldown: s.fireCooldown,
    protection: s.protection, sunk: s.sunk, respawnIn: s.respawnIn, sinkings: s.sinkings,
    boostEnergy: s.boostEnergy, shieldEnergy: s.shieldEnergy,
  }));
  return { time, ships, shots, nextShotId, contacts, over };
}

describe("packs off plays exactly as Stage 0", () => {
  it("was recorded with the current tuning (if not: tuning changed since; re-record with approval)", () => {
    expect(JSON.parse(JSON.stringify(TUNING))).toEqual(recorded.tuning);
  });

  it("replays the recorded 90-second fight identically", () => {
    let world = createWorld();
    const events: SimEvent[] = [];
    const ticks = Math.round(STAGE0_SCRIPT_SECONDS / STAGE0_SCRIPT_DT);
    for (let i = 0; i < ticks; i++) {
      const result = step(world, stage0ScriptInputs(world), STAGE0_SCRIPT_DT);
      world = result.world;
      events.push(...result.events);
    }
    expect(events).toEqual(recorded.events);
    expect(stage0View(world)).toEqual(stage0View(recorded.world));
  });

  it("is a real fight, so the check means something", () => {
    const count = (type: string) => recorded.events.filter((e) => e.type === type).length;
    expect(count("hit")).toBeGreaterThan(20);
    expect(count("sunk")).toBeGreaterThan(3);
    expect(count("respawned")).toBeGreaterThan(3);
    expect(count("shotBlocked")).toBeGreaterThan(0);
    expect(count("energyEmpty")).toBeGreaterThan(0);
  });
});
