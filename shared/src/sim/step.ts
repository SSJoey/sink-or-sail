import { TUNING } from "../tuning.ts";
import { bumpDamage, canBeDamaged, damageShip, traceShot } from "./combat.ts";
import { updateEnergy } from "./energy.ts";
import { ISLAND, SPAWN_POINTS } from "./map.ts";
import { pickUpPacks, updatePacks } from "./packs.ts";
import { matchResult } from "./match.ts";
import { chooseSpawn, respawnShip } from "./respawn.ts";
import { keepInSea, pushOutOfIsland, separateShips, steerShip } from "./ship.ts";
import { NO_INPUT, type Ship, type ShipInput, type Shot, type SimEvent, type World } from "./types.ts";
import { aimTurret, fireGun, moveShot } from "./weapons.ts";

/** Guards timer comparisons against float drift from adding dt many times. */
const EPSILON = 1e-9;

const contactKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Advances the match by `dt` seconds. Pure: returns a new world and the events that happened.
 * `inputs[shipId]` is that ship's crew input; a missing entry means no input.
 *
 * Order: sunk ships count down and respawn → afloat ships aim, use energy, steer and fire →
 * ship-vs-ship bumps → island and sea edge → shots move and hit → match timer.
 */
export function step(world: World, inputs: readonly (ShipInput | undefined)[], dt: number): { world: World; events: SimEvent[] } {
  if (world.over || !(dt > 0) || !Number.isFinite(dt)) return { world, events: [] };

  const events: SimEvent[] = [];
  const ships: Ship[] = [...world.ships];
  const shots: Shot[] = [...world.shots];
  let nextShotId = world.nextShotId;

  const sink = (targetIndex: number, by: number | null) => {
    const sunk = ships[targetIndex]!;
    events.push({ type: "sunk", ship: sunk.id, by });
    if (sunk.held) {
      events.push({ type: "packLost", ship: sunk.id, packType: sunk.held });
      ships[targetIndex] = { ...sunk, held: null };
    }
    if (by !== null) {
      const attacker = ships.findIndex((s) => s.id === by);
      if (attacker >= 0) ships[attacker] = { ...ships[attacker]!, sinkings: ships[attacker]!.sinkings + 1 };
    }
  };

  // Sunk ships count down and respawn; afloat ships act on their crew's input.
  for (let i = 0; i < ships.length; i++) {
    let ship = ships[i]!;
    if (ship.sunk) {
      const respawnIn = ship.respawnIn - dt;
      if (respawnIn > EPSILON) {
        ships[i] = { ...ship, respawnIn };
        continue;
      }
      const enemies = ships.filter((s) => s.id !== ship.id && !s.sunk).map((s) => s.pos);
      ship = respawnShip(ship, chooseSpawn(SPAWN_POINTS, enemies));
      events.push({ type: "respawned", ship: ship.id, pos: ship.pos });
      ships[i] = ship;
      continue;
    }

    if (ship.protection > 0) {
      const protection = Math.max(0, ship.protection - dt);
      if (protection <= EPSILON) events.push({ type: "protectionEnded", ship: ship.id });
      ship = { ...ship, protection: protection <= EPSILON ? 0 : protection };
    }

    const input = inputs[ship.id] ?? NO_INPUT;
    ship = aimTurret(ship, input.gunner.aim);

    const energy = updateEnergy(
      { energy: ship.energy, locked: ship.energyLocked, boosting: ship.boosting, shielding: ship.shielding },
      ship.id,
      { boost: input.pilot.boost, shield: input.gunner.shield },
      dt,
    );
    events.push(...energy.events);
    ship = {
      ...ship,
      energy: energy.state.energy,
      energyLocked: energy.state.locked,
      boosting: energy.state.boosting,
      shielding: energy.state.shielding,
      boostEnergy: ship.boostEnergy + energy.spent.boost,
      shieldEnergy: ship.shieldEnergy + energy.spent.shield,
    };

    ship = steerShip(ship, input.pilot, ship.boosting, dt);

    const fired = fireGun(ship, input.gunner, dt, nextShotId);
    ship = fired.ship;
    events.push(...fired.events);
    if (fired.shot) {
      shots.push(fired.shot);
      nextShotId++;
    }
    ships[i] = ship;
  }

  // Ship-vs-ship: push apart; a new contact deals bump damage to both.
  const contacts: string[] = [];
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      if (ships[i]!.sunk || ships[j]!.sunk) continue;
      const result = separateShips(ships[i]!, ships[j]!);
      let a = result.a;
      let b = result.b;
      if (!result.touching) continue;
      const key = contactKey(a.id, b.id);
      contacts.push(key);
      if (world.contacts.includes(key)) {
        ships[i] = a;
        ships[j] = b;
        continue;
      }

      const damage = bumpDamage(result.closingSpeed);
      const damageA = canBeDamaged(a) ? damage : 0;
      const damageB = canBeDamaged(b) ? damage : 0;
      events.push({ type: "bump", ships: [a.id, b.id], damage: [damageA, damageB] });
      const hurtA = damageShip(a, damageA);
      const hurtB = damageShip(b, damageB);
      a = hurtA.ship;
      b = hurtB.ship;
      ships[i] = a;
      ships[j] = b;
      if (damageA > 0 && hurtA.sank) sink(i, b.id);
      if (damageB > 0 && hurtB.sank) sink(j, a.id);
    }
  }

  // The island and the sea edge win over ship pushes, so nothing ends up inside them.
  for (let i = 0; i < ships.length; i++) {
    if (!ships[i]!.sunk) ships[i] = keepInSea(pushOutOfIsland(ships[i]!, ISLAND));
  }

  // Stage 1 packs: the spawn clock runs, then ships take packs they touch (so a clock restarted by a
  // pickup counts from the next step, like one restarted by a pack appearing). Skipped with packs off.
  let packWorld: World | null = null;
  if (world.packsOn) {
    const updated = updatePacks({ ...world, ships }, dt);
    const picked = pickUpPacks(updated.world);
    packWorld = picked.world;
    ships.splice(0, ships.length, ...picked.world.ships);
    events.push(...updated.events, ...picked.events);
  }

  // Shots move along their path and stop at the first ship or the island in the way.
  const survivingShots: Shot[] = [];
  for (const shot of shots) {
    const moved = moveShot(shot, dt);
    const trace = traceShot(shot.owner, moved.from, moved.to, ships, ISLAND);
    if (trace.kind === "ship") {
      const index = ships.findIndex((s) => s.id === trace.target);
      const target = ships[index]!;
      if (target.shielding) {
        events.push({ type: "shotBlocked", attacker: shot.owner, target: target.id });
      } else if (canBeDamaged(target)) {
        const hurt = damageShip(target, TUNING.gun.shotDamage);
        ships[index] = hurt.ship;
        events.push({ type: "hit", attacker: shot.owner, target: target.id, damage: TUNING.gun.shotDamage });
        if (hurt.sank) sink(index, shot.owner);
      }
      continue;
    }
    if (trace.kind === "island" || moved.expired) continue;
    survivingShots.push(moved.shot);
  }

  const time = world.time + dt;
  const next: World = {
    ...world,
    ...(packWorld && { rng: packWorld.rng, packs: packWorld.packs, nextPackId: packWorld.nextPackId, nextSignalIn: packWorld.nextSignalIn }),
    time,
    ships,
    shots: survivingShots,
    nextShotId,
    contacts,
    over: false,
  };
  if (time >= TUNING.match.duration - EPSILON) {
    next.over = true;
    events.push({ type: "matchEnded", winner: matchResult(next).winner });
  }
  return { world: next, events };
}
