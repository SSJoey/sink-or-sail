import { TUNING } from "../tuning.ts";
import { bumpDamage, canBeDamaged, damageShip, traceShot } from "./combat.ts";
import { updateEnergy } from "./energy.ts";
import { SPAWN_POINTS } from "./map.ts";
import { blastMine, canDropAt, dropSpot, isArmed, updateMines } from "./mines.ts";
import { pickUpPacks, updatePacks, updateWreckPacks } from "./packs.ts";
import { launchTorpedo, outsideSea, torpedoDamage } from "./torpedoes.ts";
import { matchDuration, matchResult } from "./match.ts";
import { chooseSpawn, respawnShip } from "./respawn.ts";
import { keepInSea, pushOutOfIslands, separateShips, steerShip } from "./ship.ts";
import { NO_INPUT, type Mine, type Ship, type ShipInput, type Shot, type SimEvent, type SinkCause, type Torpedo, type World, type Wreck, type WreckPack, type WreckWeapon } from "./types.ts";
import { add, distance, scale } from "./vec.ts";
import { circleOverlapsPolygon, pointInPolygon } from "./geometry.ts";
import { ramDamage, touchingWreck, wreckContactKey, wreckDamage } from "./wrecks.ts";
import { inStorm, respawnInside, stormRadius, stormTicks } from "./storm.ts";
import { aimTurret, fireGun, moveShot } from "./weapons.ts";

/** Guards timer comparisons against float drift from adding dt many times. */
const EPSILON = 1e-9;

const contactKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Advances the match by `dt` seconds. Pure: returns a new world and the events that happened.
 * `inputs[shipId]` is that ship's crew input; a missing entry means no input.
 *
 * Order: sunk ships count down and respawn → afloat ships aim, use energy, steer and fire →
 * ship-vs-ship bumps → ramming wrecks → islands, wrecks and sea edge → reefs → packs → mines →
 * shots and torpedoes move and hit → packs from wrecks destroyed this step → match timer.
 */
export function step(world: World, inputs: readonly (ShipInput | undefined)[], dt: number): { world: World; events: SimEvent[] } {
  if (world.over || !(dt > 0) || !Number.isFinite(dt)) return { world, events: [] };

  const events: SimEvent[] = [];
  const ships: Ship[] = [...world.ships];
  const shots: Shot[] = [...world.shots];
  let nextShotId = world.nextShotId;
  const droppedMines: Mine[] = [];
  let nextMineId = world.nextMineId;
  const torpedoes: Torpedo[] = [...world.torpedoes];
  let nextTorpedoId = world.nextTorpedoId;
  let wrecks: Wreck[] = world.wrecks;
  let wreckPacks: WreckPack[] = world.wreckPacks;
  const destroyedWrecks: Wreck[] = [];
  /** Islands and the wrecks still standing: what blocks ships and mine drops. */
  const solids = () => (wrecks.length === 0 ? world.islands : [...world.islands, ...wrecks.map((w) => w.hull)]);

  const sink = (targetIndex: number, by: number | null, cause: SinkCause) => {
    const sunk = ships[targetIndex]!;
    if (world.mode === "lastAfloat") {
      // Each sinking costs a life; on the last one the ship is out and never respawns.
      const livesLeft = Math.max(0, (sunk.livesLeft ?? 0) - 1);
      const out = livesLeft === 0;
      ships[targetIndex] = { ...sunk, livesLeft, out, respawnIn: out ? 0 : sunk.respawnIn };
      events.push({ type: "sunk", ship: sunk.id, by, cause, livesLeft });
      if (out) events.push({ type: "crewOut", ship: sunk.id });
    } else {
      events.push({ type: "sunk", ship: sunk.id, by, cause });
    }
    for (const slot of ["pilotPack", "gunnerPack"] as const) {
      const lost = ships[targetIndex]![slot];
      if (lost) {
        events.push({ type: "packLost", ship: sunk.id, packType: lost });
        ships[targetIndex] = { ...ships[targetIndex]!, [slot]: null };
      }
    }
    if (by !== null) {
      const attacker = ships.findIndex((s) => s.id === by);
      if (attacker >= 0) ships[attacker] = { ...ships[attacker]!, sinkings: ships[attacker]!.sinkings + 1 };
    }
  };

  // Stage 2: a wreck takes damage; at 0 it's destroyed (credited to `by`), and any pack it holds is released at the end of the step.
  const hitWreck = (id: number, by: number | null, weapon: WreckWeapon, damage: number, shipDamage?: number) => {
    const wreck = wrecks.find((w) => w.id === id);
    if (!wreck) return;
    events.push({ type: "wreckHit", wreck: id, by, weapon, damage, ...(shipDamage !== undefined && { shipDamage }) });
    const health = wreck.health - damage;
    if (health > 1e-9) {
      wrecks = wrecks.map((w) => (w.id === id ? { ...w, health } : w));
      return;
    }
    wrecks = wrecks.filter((w) => w.id !== id);
    destroyedWrecks.push(wreck);
    events.push({ type: "wreckDestroyed", wreck: id, by });
  };

  // EMP timers run down first, so a ship caught during this step is disabled for exactly the full time.
  for (let i = 0; i < ships.length; i++) {
    if (ships[i]!.disabled > 0) ships[i] = { ...ships[i]!, disabled: Math.max(0, ships[i]!.disabled - dt) };
  }

  // Sunk ships count down and respawn; afloat ships act on their crew's input.
  for (let i = 0; i < ships.length; i++) {
    let ship = ships[i]!;
    if (ship.sunk) {
      if (ship.out) continue;
      const respawnIn = ship.respawnIn - dt;
      if (respawnIn > EPSILON) {
        ships[i] = { ...ship, respawnIn };
        continue;
      }
      const enemies = ships.filter((s) => s.id !== ship.id && !s.sunk).map((s) => s.pos);
      const spot = chooseSpawn(SPAWN_POINTS, enemies);
      // Stage 2: while the storm closes, a ship comes back inside the circle.
      ship = respawnShip(ship, world.storm ? respawnInside(spot, stormRadius(world.storm, world.time), solids()) : spot);
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
    // An EMP'd ship can steer, but can't fire, boost, shield or use packs.
    const disabled = ship.disabled > EPSILON;
    ship = aimTurret(ship, input.gunner.aim);

    const energy = updateEnergy(
      { energy: ship.energy, locked: ship.energyLocked, boosting: ship.boosting, shielding: ship.shielding },
      ship.id,
      { boost: input.pilot.boost && !disabled, shield: input.gunner.shield && !disabled },
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

    ship = steerShip(ship, input.pilot, ship.boosting, dt, ship.onReef ? TUNING.reef.speedFactor : 1);

    const fired = fireGun(ship, disabled ? { ...input.gunner, fire: false } : input.gunner, dt, nextShotId);
    ship = fired.ship;
    events.push(...fired.events);
    if (fired.shot) {
      shots.push(fired.shot);
      nextShotId++;
    }

    // Stage 1: the pilot's Pack button drops a loaded mine behind the stern (if that spot is clear).
    if (world.packsOn && !disabled && input.pilot.pack && ship.pilotPack === "mine") {
      const pos = dropSpot(ship);
      if (canDropAt(pos, solids())) {
        const mine: Mine = { id: nextMineId++, owner: ship.id, pos, age: 0 };
        droppedMines.push(mine);
        ship = { ...ship, pilotPack: null };
        events.push({ type: "packUsed", ship: ship.id, packType: "mine", role: "pilot" }, { type: "mineDropped", mine: mine.id, owner: ship.id, pos });
      }
    }
    // Stage 1: the gunner's Pack button fires a loaded torpedo along the heading (allowed with the shield up).
    // Like firing the gun, it ends respawn protection.
    if (world.packsOn && !disabled && input.gunner.pack && ship.gunnerPack === "torpedo") {
      const torpedo = launchTorpedo(ship, nextTorpedoId++);
      torpedoes.push(torpedo);
      events.push(
        { type: "packUsed", ship: ship.id, packType: "torpedo", role: "gunner" },
        { type: "torpedoFired", torpedo: torpedo.id, owner: ship.id, pos: torpedo.pos, heading: ship.heading },
      );
      if (ship.protection > 0) events.push({ type: "protectionEnded", ship: ship.id });
      ship = { ...ship, gunnerPack: null, protection: 0 };
    }
    // Stage 1: the gunner's Pack button fires a loaded EMP, centred on this ship. Enemy ships in range
    // (afloat, not protected) lose fire, boost, shield and packs for the EMP's duration; shields drop at once.
    if (world.packsOn && !disabled && input.gunner.pack && ship.gunnerPack === "emp") {
      const caught: number[] = [];
      for (let j = 0; j < ships.length; j++) {
        const other = ships[j]!;
        if (j === i || other.sunk || other.protection > 0) continue;
        if (distance(other.pos, ship.pos) >= TUNING.ship.radius + TUNING.emp.radius) continue;
        ships[j] = { ...other, disabled: TUNING.emp.duration, shielding: false, boosting: false };
        caught.push(other.id);
      }
      events.push({ type: "packUsed", ship: ship.id, packType: "emp", role: "gunner" }, { type: "empFired", ship: ship.id, caught });
      if (ship.protection > 0) events.push({ type: "protectionEnded", ship: ship.id });
      ship = { ...ship, gunnerPack: null, protection: 0 };
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
      if (damageA > 0 && hurtA.sank) sink(i, b.id, "bump");
      if (damageB > 0 && hurtB.sank) sink(j, a.id, "bump");
    }
  }

  // Stage 2: a ship that starts touching a wreck rams it: a bump for the ship, the ram factor times that for the wreck.
  for (let i = 0; i < ships.length && wrecks.length > 0; i++) {
    for (const wreck of wrecks) {
      const ship = ships[i]!;
      if (ship.sunk) break;
      const touch = touchingWreck(ship, wreck);
      if (!touch) continue;
      const key = wreckContactKey(ship.id, wreck.id);
      contacts.push(key);
      if (world.contacts.includes(key)) continue;
      const ram = ramDamage(ship, touch.normal);
      if (ram.wreck <= 0) continue;
      const hurt = damageShip(ship, ram.ship);
      ships[i] = hurt.ship;
      hitWreck(wreck.id, ship.id, "bump", ram.wreck, ram.ship);
      if (ram.ship > 0 && hurt.sank) sink(i, null, "wreck");
    }
  }

  // The islands, wrecks and the sea edge win over ship pushes, so nothing ends up inside them.
  const blocking = solids();
  for (let i = 0; i < ships.length; i++) {
    if (!ships[i]!.sunk) ships[i] = keepInSea(pushOutOfIslands(ships[i]!, blocking));
  }

  // Stage 2 reefs: a ship whose centre enters one takes a hit (not while protected); on one, it's slowed next step.
  if (world.reefs.length > 0) {
    for (let i = 0; i < ships.length; i++) {
      const ship = ships[i]!;
      if (ship.sunk) continue;
      const onReef = world.reefs.some((reef) => pointInPolygon(ship.pos, reef));
      if (onReef === ship.onReef) continue;
      ships[i] = { ...ship, onReef };
      if (!onReef || ship.protection > 0) continue;
      const damage = TUNING.ship.maxHealth * TUNING.reef.damage;
      const hurt = damageShip(ships[i]!, damage);
      ships[i] = hurt.ship;
      events.push({ type: "reefHit", ship: ship.id, damage });
      if (hurt.sank) sink(i, null, "reef");
    }
  }

  // Stage 2 closing storm: it signals starting and closing; each tick, ships outside the circle (not protected) are hurt.
  if (world.storm) {
    const { startsAt, closedAt } = world.storm;
    const to = world.time + dt;
    if (world.time < startsAt - EPSILON && to >= startsAt - EPSILON) events.push({ type: "stormStarted" });
    if (world.time < closedAt - EPSILON && to >= closedAt - EPSILON) events.push({ type: "stormClosed" });
    if (stormTicks(world.storm, world.time, to) > 0) {
      const radius = stormRadius(world.storm, to);
      for (let i = 0; i < ships.length; i++) {
        const ship = ships[i]!;
        if (ship.sunk || ship.protection > 0 || !inStorm(ship.pos, radius)) continue;
        const damage = TUNING.ship.maxHealth * TUNING.closingStorm.damage;
        const hurt = damageShip(ship, damage);
        ships[i] = hurt.ship;
        events.push({ type: "stormDamage", ship: ship.id, damage });
        if (hurt.sank) sink(i, null, "storm");
      }
    }
  }

  // Stage 1 packs: the spawn clock runs, then ships take packs they touch (so a clock restarted by a
  // pickup counts from the next step, like one restarted by a pack appearing). Skipped with packs off.
  let packWorld: World | null = null;
  if (world.packsOn) {
    const updated = updatePacks({ ...world, ships }, dt);
    const picked = pickUpPacks(updated.world);
    const fromWrecks = updateWreckPacks(picked.world, dt);
    packWorld = fromWrecks.world;
    wreckPacks = fromWrecks.world.wreckPacks;
    ships.splice(0, ships.length, ...fromWrecks.world.ships);
    events.push(...updated.events, ...picked.events, ...fromWrecks.events);
  }

  // A mine goes off: every ship touching it takes damage; sinkings are credited by blastMine's rules.
  // Set off by a shot or a torpedo, it counts as that weapon; sailed into, as a mine (or the ship's own).
  const blast = (mine: Mine, shooter: number | null, weapon: "shot" | "torpedo" | null) => {
    const result = blastMine(ships, mine, shooter);
    events.push(result.event);
    for (const hit of result.hits) {
      if (hit.damage <= 0) continue;
      const hurt = damageShip(ships[hit.index]!, hit.damage);
      ships[hit.index] = hurt.ship;
      if (hurt.sank) sink(hit.index, result.creditFor(hurt.ship.id), weapon ?? (hurt.ship.id === mine.owner ? "ownMine" : "mine"));
    }
    // Stage 2: wrecks in the blast take mine damage, credited to whoever set it off (the owner when sailed into).
    for (const wreck of wrecks.filter((w) => circleOverlapsPolygon(mine.pos, TUNING.mine.blastRadius, w.hull))) {
      hitWreck(wreck.id, shooter ?? mine.owner, "mine", wreckDamage("mine"));
    }
  };

  // Stage 1 mines age, arm, expire, and go off when a ship touches an armed one. Mines dropped this
  // step start ageing next step, so they arm exactly the arm time after the drop.
  let mines: Mine[] = world.mines;
  if (mines.length > 0) {
    const updated = updateMines(mines, ships, dt);
    events.push(...updated.events);
    for (const mine of updated.touched) blast(mine, null, null);
    mines = updated.mines;
  }
  mines = [...mines, ...droppedMines];

  // Shots move along their path and stop at the first ship, the island or an armed mine in the way.
  // A shot that reaches an armed mine sets it off and is used up.
  const survivingShots: Shot[] = [];
  for (const shot of shots) {
    const moved = moveShot(shot, dt);
    const trace = traceShot(shot.owner, moved.from, moved.to, ships, world.islands, mines.filter(isArmed), wrecks);
    if (trace.kind === "wreck") {
      hitWreck(trace.wreck, shot.owner, "shot", wreckDamage("shot"));
      continue;
    }
    if (trace.kind === "mine") {
      const mine = mines.find((m) => m.id === trace.mine)!;
      mines = mines.filter((m) => m.id !== trace.mine);
      blast(mine, shot.owner, "shot");
      continue;
    }
    if (trace.kind === "ship") {
      const index = ships.findIndex((s) => s.id === trace.target);
      const target = ships[index]!;
      if (target.shielding) {
        events.push({ type: "shotBlocked", attacker: shot.owner, target: target.id });
      } else if (canBeDamaged(target)) {
        const hurt = damageShip(target, TUNING.gun.shotDamage);
        ships[index] = hurt.ship;
        events.push({ type: "hit", attacker: shot.owner, target: target.id, damage: TUNING.gun.shotDamage });
        if (hurt.sank) sink(index, shot.owner, "shot");
      }
      continue;
    }
    if (trace.kind === "island" || moved.expired) continue;
    survivingShots.push(moved.shot);
  }

  // Stage 1 torpedoes move straight on and stop at the first ship (not their own), the island, an armed
  // mine (which they set off) or the sea edge.
  const runningTorpedoes: Torpedo[] = [];
  for (const torpedo of torpedoes) {
    const to = add(torpedo.pos, scale(torpedo.vel, dt));
    const trace = traceShot(torpedo.owner, torpedo.pos, to, ships, world.islands, mines.filter(isArmed), wrecks);
    if (trace.kind === "wreck") {
      events.push({ type: "torpedoEnded", torpedo: torpedo.id, owner: torpedo.owner, reason: "wreck" });
      hitWreck(trace.wreck, torpedo.owner, "torpedo", wreckDamage("torpedo"));
      continue;
    }
    if (trace.kind === "ship") {
      const index = ships.findIndex((s) => s.id === trace.target);
      const { damage, shieldHalved } = torpedoDamage(ships[index]!);
      events.push({ type: "torpedoHit", torpedo: torpedo.id, attacker: torpedo.owner, target: trace.target, damage, shieldHalved });
      if (damage > 0) {
        const hurt = damageShip(ships[index]!, damage);
        ships[index] = hurt.ship;
        if (hurt.sank) sink(index, torpedo.owner, "torpedo");
      }
      continue;
    }
    if (trace.kind === "mine") {
      const mine = mines.find((m) => m.id === trace.mine)!;
      mines = mines.filter((m) => m.id !== trace.mine);
      events.push({ type: "torpedoEnded", torpedo: torpedo.id, owner: torpedo.owner, reason: "mine" });
      blast(mine, torpedo.owner, "torpedo");
      continue;
    }
    if (trace.kind === "island" || outsideSea(to)) {
      events.push({ type: "torpedoEnded", torpedo: torpedo.id, owner: torpedo.owner, reason: trace.kind === "island" ? "island" : "edge" });
      continue;
    }
    runningTorpedoes.push({ ...torpedo, pos: to });
  }

  // Stage 2: wrecks destroyed this step release their packs where they stood (with packs on), ready to take next step.
  let nextPackId = packWorld?.nextPackId ?? world.nextPackId;
  if (world.packsOn) {
    for (const wreck of destroyedWrecks) {
      if (!wreck.pack) continue;
      const pack: WreckPack = { id: nextPackId++, wreck: wreck.id, pos: wreck.pos, type: wreck.pack, lifeLeft: TUNING.packs.lifetime };
      wreckPacks = [...wreckPacks, pack];
      events.push({ type: "wreckPackReleased", wreck: wreck.id, pack: pack.id, packType: pack.type });
    }
  }

  const time = world.time + dt;
  const next: World = {
    ...world,
    ...(packWorld && { rng: packWorld.rng, packs: packWorld.packs, nextSignalIn: packWorld.nextSignalIn }),
    nextPackId,
    wrecks,
    wreckPacks,
    time,
    ships,
    shots: survivingShots,
    nextShotId,
    mines,
    nextMineId,
    torpedoes: runningTorpedoes,
    nextTorpedoId,
    contacts,
    over: false,
  };
  // Last Afloat ends when one ship (or none) is left in the match; either mode ends when the clock runs out.
  const lastAfloat = world.mode === "lastAfloat" && ships.filter((s) => !s.out).length <= 1;
  if (lastAfloat || time >= matchDuration(world) - EPSILON) {
    next.over = true;
    events.push({ type: "matchEnded", winner: matchResult(next).winner, reason: lastAfloat ? "lastAfloat" : "time" });
  }
  return { world: next, events };
}
