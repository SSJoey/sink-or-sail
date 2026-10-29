import { TUNING } from "../tuning.ts";
import { circleOverlapsPolygon, pointInPolygon, segmentPolygonHit, type Polygon } from "./geometry.ts";
import { inMovingStorm } from "./hazards.ts";
import { SEA_CENTRE } from "./map.ts";
import { nextRandom } from "./random.ts";
import { stormRadius } from "./storm.ts";
import type { GunnerInput, Hazard, PackType, PilotInput, Ship, World } from "./types.ts";
import { add, angleOf, distance, dot, fromAngle, normalise, scale, sub, wrapAngle, type Vec } from "./vec.ts";

// Stage 3 partner bots: plain functions from the match state to a pilot's or gunner's controls, like a player's
// input. A bot rethinks every `thinkEvery` seconds and keeps its controls in between; its aim wobble comes from its
// own seeded generator, so the same seed gives the same bot.

const B = TUNING.bots;
const EPSILON = 1e-9;

export interface BotMind {
  /** The bot's own seeded generator state. */
  rng: number;
  /** Seconds until it next rethinks (0: on the next tick). */
  thinkIn: number;
  /** Gunner: the ship's health when it last looked (a drop means a hit), and seconds of shield left. */
  seenHealth: number;
  shieldLeft: number;
  /** Pilot: which way it circles an enemy (1 or -1). */
  circle: number;
  pilot: PilotInput;
  gunner: GunnerInput;
}

/** A bot's mind at the match start, seeded from the match seed, its ship and its role. */
export function newBotMind(seed: number, ship: number, role: "pilot" | "gunner"): BotMind {
  const rng = (seed ^ Math.imul(ship + 1, 0x9e3779b1) ^ (role === "pilot" ? 0x51ed27 : 0x2c1b3c6d)) >>> 0;
  return {
    rng,
    thinkIn: 0,
    seenHealth: TUNING.ship.maxHealth,
    shieldLeft: 0,
    circle: ship % 2 === 0 ? 1 : -1,
    pilot: { steer: { x: 0, y: 0 }, boost: false },
    gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false },
  };
}

/** A hazard that hides what's in it: a moving storm that has formed (and until it has faded). */
const isCloud = (h: Hazard) => h.kind === "movingStorm" && (h.phase === "active" || h.phase === "fading");

/** Enemy ships the bot's ship can see: afloat and not hidden in a moving storm. Nearest first. */
export function visibleEnemies(world: World, ship: Ship): Ship[] {
  const clouds = world.hazards.filter(isCloud);
  return world.ships
    .filter((s) => s.id !== ship.id && !s.sunk && !clouds.some((c) => inMovingStorm(s.pos, c)))
    .sort((a, b) => distance(a.pos, ship.pos) - distance(b.pos, ship.pos));
}

/** What blocks ships: islands and standing wrecks. */
const solidsOf = (world: World): Polygon[] => [...world.islands, ...world.wrecks.map((w) => w.hull)];

/** Nothing solid between two points (what a shot or torpedo would run into). */
function clearLine(from: Vec, to: Vec, solids: readonly Polygon[]): boolean {
  return solids.every((solid) => segmentPolygonHit(from, to, solid) === null);
}

const canBoost = (ship: Ship) => !ship.energyLocked && ship.energy >= B.boostEnergy;

/**
 * The gunner: aims at the nearest enemy it can see, leading it, with wobble; fires when aimed within `fireAngle`,
 * in range and with nothing solid in the way; raises the shield for `shieldSeconds` after a hit (with energy);
 * fires a torpedo at an enemy nearly dead ahead and an EMP at one close by.
 */
export function botGunner(world: World, shipId: number, mind: BotMind, dt: number): { input: GunnerInput; mind: BotMind } {
  const ship = world.ships[shipId]!;
  let next: BotMind = { ...mind, shieldLeft: Math.max(0, mind.shieldLeft - dt), thinkIn: mind.thinkIn - dt };
  let pack = false;
  if (mind.thinkIn <= EPSILON) {
    next.thinkIn = B.thinkEvery - dt;
    const hit = ship.health < next.seenHealth - EPSILON;
    next.seenHealth = ship.health;
    if (ship.sunk) next = { ...next, shieldLeft: 0, gunner: { aim: next.gunner.aim, fire: false, shield: false } };
    else {
      if (hit && !ship.energyLocked && ship.energy >= B.shieldEnergy) next.shieldLeft = B.shieldSeconds;
      const wobble = nextRandom(next.rng);
      next.rng = wobble.state;
      const error = (wobble.value * 2 - 1) * B.aimWobble;
      const solids = solidsOf(world);
      const target = visibleEnemies(world, ship)[0];
      if (target) {
        const aimAt = leadPoint(ship.pos, target);
        const aim = fromAngle(angleOf(sub(aimAt, ship.pos)) + error);
        const range = distance(ship.pos, target.pos);
        const fire = Math.abs(error) <= B.fireAngle + EPSILON && range <= B.fireRange && clearLine(ship.pos, aimAt, solids);
        next.gunner = { aim, fire, shield: false };
        pack = gunnerPackNow(world, ship, solids);
      } else {
        next.gunner = { aim: next.gunner.aim, fire: false, shield: false };
      }
    }
  }
  const shield = next.shieldLeft > EPSILON && !ship.sunk;
  const input: GunnerInput = { ...next.gunner, fire: next.gunner.fire && !shield, shield, ...(pack && { pack: true }) };
  return { input, mind: next };
}

/** Where to aim so a shot meets a target sailing on as it is (two rounds of the usual estimate). */
function leadPoint(from: Vec, target: Ship): Vec {
  let aimAt = target.pos;
  for (let i = 0; i < 2; i++) aimAt = add(target.pos, scale(target.vel, distance(from, aimAt) / TUNING.gun.shotSpeed));
  return aimAt;
}

/** Torpedo: an enemy within `torpedoAngle` of the bow, in range and in the clear. EMP: an enemy within `empRange`. */
function gunnerPackNow(world: World, ship: Ship, solids: readonly Polygon[]): boolean {
  const enemies = visibleEnemies(world, ship);
  if (ship.gunnerPack === "emp") return enemies.some((e) => distance(e.pos, ship.pos) <= B.empRange);
  if (ship.gunnerPack === "torpedo") {
    return enemies.some((e) => distance(e.pos, ship.pos) <= B.torpedoRange
      && Math.abs(wrapAngle(angleOf(sub(e.pos, ship.pos)) - ship.heading)) <= B.torpedoAngle
      && clearLine(ship.pos, e.pos, solids));
  }
  return false;
}

/** Whether the ship can take a pack of this type now (health only when hurt, others when that slot is free). */
function canUse(ship: Ship, type: PackType): boolean {
  if (type === "health") return ship.health < TUNING.ship.maxHealth - EPSILON;
  if (type === "mine") return ship.pilotPack === null;
  return ship.gunnerPack === null;
}

/**
 * The pilot. In order: get away from a whirlpool or the kraken; get back inside the closing storm's circle; run
 * when badly hurt with an enemy close; head for a pack it can use (up to `packDetour` away; any distance with no
 * enemy in sight); otherwise close to `fightDistance` from the nearest enemy and circle it. It steers round islands,
 * wrecks, reefs and whirlpools by looking `lookAhead` ahead, and drops a mine when an enemy is close behind.
 */
export function botPilot(world: World, shipId: number, mind: BotMind, dt: number): { input: PilotInput; mind: BotMind } {
  const ship = world.ships[shipId]!;
  const next: BotMind = { ...mind, thinkIn: mind.thinkIn - dt };
  if (mind.thinkIn > EPSILON) return { input: next.pilot, mind: next };
  next.thinkIn = B.thinkEvery - dt;
  if (ship.sunk) {
    next.pilot = { steer: { x: 0, y: 0 }, boost: false };
    return { input: next.pilot, mind: next };
  }
  const { goal, boost } = pilotGoal(world, ship, next.circle);
  const steer = clearHeading(world, ship, goal);
  const enemies = visibleEnemies(world, ship);
  const behind = (e: Ship) => distance(e.pos, ship.pos) <= B.mineRange && dot(sub(e.pos, ship.pos), fromAngle(ship.heading)) < 0;
  const pack = ship.pilotPack === "mine" && enemies.some(behind);
  next.pilot = { steer, boost: boost && canBoost(ship) };
  return { input: pack ? { ...next.pilot, pack: true } : next.pilot, mind: next };
}

/** The direction the pilot wants to go (a unit vector), and whether it wants to boost. */
function pilotGoal(world: World, ship: Ship, circle: number): { goal: Vec; boost: boolean } {
  const away = (from: Vec) => normalise(sub(ship.pos, from));
  for (const h of world.hazards) {
    if (h.phase === "fading") continue;
    const d = distance(ship.pos, h.pos);
    if (h.kind === "whirlpool" && d < TUNING.whirlpool.reach + B.whirlpoolBerth) return { goal: away(h.pos), boost: h.phase === "active" && d < TUNING.whirlpool.reach };
    if (h.kind === "kraken" && h.phase === "active" && d < B.krakenBerth) return { goal: away(h.pos), boost: true };
  }
  if (world.storm) {
    const safe = stormRadius(world.storm, world.time + B.stormAhead) - B.stormInset;
    if (distance(ship.pos, SEA_CENTRE) > safe) return { goal: normalise(sub(SEA_CENTRE, ship.pos)), boost: false };
  }
  const enemies = visibleEnemies(world, ship);
  const nearest = enemies[0];
  if (nearest && ship.health <= B.escapeHealth * TUNING.ship.maxHealth + EPSILON && distance(nearest.pos, ship.pos) <= B.escapeRange) {
    return { goal: away(nearest.pos), boost: true };
  }
  const reach = nearest ? B.packDetour : Infinity;
  const pack = packsInSight(world)
    .filter((p) => canUse(ship, p.type) && distance(p.pos, ship.pos) <= reach)
    .sort((a, b) => distance(a.pos, ship.pos) - distance(b.pos, ship.pos))[0];
  if (pack) return { goal: normalise(sub(pack.pos, ship.pos)), boost: false };
  if (!nearest) return { goal: normalise(sub(SEA_CENTRE, ship.pos)), boost: false };
  // Close in or back off to the fighting distance, circling the enemy as it gets there.
  const toward = normalise(sub(nearest.pos, ship.pos));
  const round = { x: -toward.y * circle, y: toward.x * circle };
  const k = Math.max(-1, Math.min(1, (distance(nearest.pos, ship.pos) - B.fightDistance) / 100));
  return { goal: normalise(add(scale(toward, k), scale(round, 1 - Math.abs(k)))), boost: false };
}

/** Packs that have appeared (not still glowing) and packs released from wrecks, with where they lie. */
function packsInSight(world: World): { pos: Vec; type: PackType }[] {
  return [
    ...world.packs.filter((p) => p.signalLeft <= EPSILON).map((p) => ({ pos: world.packSpots[p.spot]!, type: p.type })),
    ...world.wreckPacks.map((p) => ({ pos: p.pos, type: p.type })),
  ];
}

/** Turns between look-ahead tries, and the tries either side of the wanted direction. */
const TRY_STEP = Math.PI / 9;
const TRIES = 9;
/** Room kept between the ship's circle and an island or wreck on the way ahead. */
const CLEARANCE = 12;
/** Turns sharper than this (60°) are taken at this much of full speed. */
const SHARP_TURN = Math.PI / 3;
const SLOW_TURN = 0.4;

/**
 * The wanted direction if the way ahead is clear for `lookAhead`; otherwise the nearest direction to it that is
 * (trying 20° steps either side, the side the bow is already turning first). Clear means: inside the sea and no
 * island or wreck; better still, no reef or whirlpool either. With nothing clear, the wanted direction.
 */
function clearHeading(world: World, ship: Ship, goal: Vec): Vec {
  const solids = solidsOf(world);
  // Already against an island or wreck: first stop pressing into it, and ease off it.
  let wanted = goal;
  for (const solid of solids) {
    const push = circleOverlapsPolygon(ship.pos, TUNING.ship.radius + 2, solid);
    const into = push ? dot(wanted, push.normal) : 0;
    if (push && into < 0.5) wanted = normalise(add(sub(wanted, scale(push.normal, into)), scale(push.normal, 0.5)));
  }
  const whirlpools = world.hazards.filter((h) => h.kind === "whirlpool" && h.phase !== "fading");
  const r = TUNING.ship.radius;
  const points = (dir: Vec) => [0.2, 0.4, 0.6, 0.8, 1].map((f) => add(ship.pos, scale(dir, B.lookAhead * f)));
  const hard = (p: Vec) => p.x < r || p.y < r || p.x > TUNING.sea.width - r || p.y > TUNING.sea.height - r
    || solids.some((s) => circleOverlapsPolygon(p, r + CLEARANCE, s) !== null);
  const soft = (p: Vec) => world.reefs.some((reef) => pointInPolygon(p, reef))
    || whirlpools.some((h) => distance(p, h.pos) < TUNING.whirlpool.reach);
  const side = wrapAngle(angleOf(wanted) - ship.heading) < 0 ? -1 : 1;
  const tries: Vec[] = [wanted];
  for (let i = 1; i <= TRIES; i++) for (const s of [side, -side]) tries.push(fromAngle(angleOf(wanted) + s * i * TRY_STEP));
  const dir = tries.find((d) => points(d).every((p) => !hard(p) && !soft(p)))
    ?? tries.find((d) => points(d).every((p) => !hard(p)))
    ?? wanted;
  // A sharp turn is taken slowly, so the ship doesn't drift wide into what it is turning away from.
  return Math.abs(wrapAngle(angleOf(dir) - ship.heading)) > SHARP_TURN ? scale(dir, SLOW_TURN) : dir;
}
