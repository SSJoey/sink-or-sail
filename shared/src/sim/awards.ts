import { TUNING } from "../tuning.ts";
import { inMovingStorm } from "./hazards.ts";
import { nextRandom } from "./random.ts";
import { inStorm, stormRadius } from "./storm.ts";
import type { PackType, SimEvent, World } from "./types.ts";
import { distance, length } from "./vec.ts";

const A = TUNING.awards;

/** Stage 3: what the awards need, per ship (index = ship id), tallied through a match. */
export interface AwardTally {
  hitsLanded: number[];
  /** Gun hits only (for accuracy). */
  shotHits: number[];
  hitsTaken: number[];
  shots: number[];
  bumps: number[];
  reefHits: number[];
  krakenGrabs: number[];
  packs: number[];
  /** Hazards set off by haunting with this crew's ghost in the zone. */
  haunted: number[];
  ownMine: number[];
  sunkByStorm: boolean[];
  firstSunk: number | null;
  /** Seconds afloat below `stationarySpeed`; in a storm (outside the closing circle, or in a moving storm); in a whirlpool. */
  stationary: number[];
  storm: number[];
  whirlpool: number[];
  /** The longest any one pack was held (pickup to use, loss or the match end), and when each slot's pack was picked up. */
  longestHold: number[];
  heldSince: { pilot: number | null; gunner: number | null }[];
}

export function newTally(ships: number): AwardTally {
  const zeros = () => Array<number>(ships).fill(0);
  return {
    hitsLanded: zeros(), shotHits: zeros(), hitsTaken: zeros(), shots: zeros(), bumps: zeros(), reefHits: zeros(), krakenGrabs: zeros(),
    packs: zeros(), haunted: zeros(), ownMine: zeros(), sunkByStorm: Array<boolean>(ships).fill(false), firstSunk: null,
    stationary: zeros(), storm: zeros(), whirlpool: zeros(), longestHold: zeros(),
    heldSince: Array.from({ length: ships }, () => ({ pilot: null, gunner: null })),
  };
}

/** A copy whose lists can be changed without touching the original. */
function copyTally(t: AwardTally): AwardTally {
  const lists = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v])) as unknown as AwardTally;
  return { ...lists, heldSince: t.heldSince.map((h) => ({ ...h })) };
}

const slotOf = (pack: PackType): "pilot" | "gunner" | null => (pack === "mine" ? "pilot" : pack === "health" ? null : "gunner");

/**
 * One step's tally: `world` is the world after the step (its time is now), `events` the step's events, `dt` its length.
 * Pure: returns a new tally.
 */
export function updateTally(tally: AwardTally, world: World, events: readonly SimEvent[], dt: number): AwardTally {
  const t = copyTally(tally);
  const add = (list: number[], ship: number, n = 1) => { if (ship >= 0 && ship < list.length) list[ship]! += n; };
  const endHold = (ship: number, slot: "pilot" | "gunner") => {
    const since = t.heldSince[ship]?.[slot];
    if (since === null || since === undefined) return;
    t.longestHold[ship] = Math.max(t.longestHold[ship]!, world.time - since);
    t.heldSince[ship]![slot] = null;
  };
  for (const e of events) {
    switch (e.type) {
      case "shotFired": add(t.shots, e.ship); break;
      case "hit": add(t.hitsLanded, e.attacker); add(t.shotHits, e.attacker); add(t.hitsTaken, e.target); break;
      case "torpedoHit": add(t.hitsLanded, e.attacker); if (e.damage > 0) add(t.hitsTaken, e.target); break;
      case "mineTriggered": for (const h of e.hits) if (h.damage > 0) add(t.hitsTaken, h.ship); break;
      case "bump":
        e.ships.forEach((ship, i) => { add(t.bumps, ship); if (e.damage[i]! > 0) add(t.hitsTaken, ship); });
        break;
      case "reefHit": add(t.reefHits, e.ship); break;
      case "krakenGrab": add(t.krakenGrabs, e.ship); break;
      case "hauntingTriggered": for (const ship of e.ghosts) add(t.haunted, ship); break;
      case "packPickedUp": {
        add(t.packs, e.ship);
        const slot = slotOf(e.packType);
        if (slot && t.heldSince[e.ship]) t.heldSince[e.ship]![slot] = world.time;
        break;
      }
      case "packUsed": case "packLost": {
        const slot = slotOf(e.packType);
        if (slot) endHold(e.ship, slot);
        break;
      }
      case "sunk":
        if (t.firstSunk === null) t.firstSunk = e.ship;
        if (e.cause === "ownMine") add(t.ownMine, e.ship);
        if (e.cause === "storm" && e.ship < t.sunkByStorm.length) t.sunkByStorm[e.ship] = true;
        break;
    }
  }
  if (dt > 0) {
    const radius = world.storm && world.time > world.storm.startsAt ? stormRadius(world.storm, world.time) : null;
    world.ships.forEach((ship, i) => {
      if (ship.sunk) return;
      if (length(ship.vel) < A.stationarySpeed) add(t.stationary, i, dt);
      const inMoving = world.hazards.some((h) => h.kind === "movingStorm" && h.phase === "active" && inMovingStorm(ship.pos, h));
      if (inMoving || (radius !== null && inStorm(ship.pos, radius))) add(t.storm, i, dt);
      if (world.hazards.some((h) => h.kind === "whirlpool" && h.phase === "active" && distance(ship.pos, h.pos) <= TUNING.whirlpool.reach)) add(t.whirlpool, i, dt);
    });
  }
  return t;
}

/** At the match end: packs still held count as held until now. */
export function closeTally(tally: AwardTally, world: World): AwardTally {
  const t = copyTally(tally);
  t.heldSince.forEach((held, ship) => {
    for (const slot of ["pilot", "gunner"] as const) {
      if (held[slot] !== null) t.longestHold[ship] = Math.max(t.longestHold[ship]!, world.time - held[slot]!);
      held[slot] = null;
    }
  });
  return t;
}

/** An award earned by one crew, with the line shown under its name ("most hits (7)"). */
export interface EarnedAward {
  award: string;
  ship: number;
  detail: string;
}

/** The award names as shown. */
export const AWARD_NAMES: Record<string, string> = {
  untouchable: "Untouchable", sharpshooter: "Sharpshooter", krakensFavourite: "Kraken's Favourite", ghost: "Ghost of the Match",
  mineAllMine: "Mine, All Mine", davyJones: "Davy Jones' Express", rockCollector: "Rock Collector", bumperBoats: "Bumper Boats",
  sittingDuck: "Sitting Duck", triggerHappy: "Trigger Happy", packRat: "Pack Rat", hoarder: "Hoarder", shieldHog: "Shield Hog",
  speedDemon: "Speed Demon", closeShave: "Close Shave", stormChaser: "Storm Chaser", whirlpoolTourist: "Whirlpool Tourist",
};

/** The one ship with the highest value (lowest with `fewest`) among `eligible`, at or past `min`; null for none or a tie. */
function leader(values: readonly number[], min: number, eligible: (ship: number) => boolean = () => true, fewest = false): number | null {
  const ships = values.map((v, ship) => ({ v, ship })).filter(({ v, ship }) => eligible(ship) && (fewest ? v <= min : v >= min));
  if (ships.length === 0) return null;
  const best = fewest ? Math.min(...ships.map((s) => s.v)) : Math.max(...ships.map((s) => s.v));
  const top = ships.filter((s) => s.v === best);
  return top.length === 1 ? top[0]!.ship : null;
}

const secs = (n: number) => `${Math.round(n)} s`;

/** Every award earned at the end of a match (a tied award goes to nobody). `world` is the final world. */
export function earnedAwards(tally: AwardTally, world: World): EarnedAward[] {
  const t = tally;
  const afloat = (ship: number) => !!world.ships[ship] && !world.ships[ship]!.sunk && !world.ships[ship]!.out;
  const earned: EarnedAward[] = [];
  const give = (award: string, ship: number | null, detail: string) => { if (ship !== null) earned.push({ award, ship, detail }); };
  const at = (list: readonly number[], ship: number | null) => (ship === null ? 0 : list[ship]!);

  let s = leader(t.hitsTaken, Infinity, afloat, true);
  give("untouchable", s, `fewest hits taken (${at(t.hitsTaken, s)})`);
  s = leader(t.hitsLanded, A.sharpshooterHits);
  give("sharpshooter", s, `most hits (${at(t.hitsLanded, s)})`);
  s = leader(t.krakenGrabs, 1);
  give("krakensFavourite", s, `grabbed by the kraken (${at(t.krakenGrabs, s)})`);
  s = leader(t.haunted, 1);
  give("ghost", s, `hazards set off as a ghost (${at(t.haunted, s)})`);
  s = leader(t.ownMine, 1);
  give("mineAllMine", s, "sunk by their own mine");
  give("davyJones", t.firstSunk, "first ship sunk");
  s = leader(t.reefHits, A.rockCollectorReefHits);
  give("rockCollector", s, `reef scrapes (${at(t.reefHits, s)})`);
  s = leader(t.bumps, A.bumperBoatsBumps);
  give("bumperBoats", s, `collisions (${at(t.bumps, s)})`);
  s = leader(t.stationary, A.sittingDuckSeconds);
  give("sittingDuck", s, `stood still ${secs(at(t.stationary, s))}`);
  // Trigger Happy: the crew that fired most, if it also has the worst accuracy of the crews that fired.
  s = leader(t.shots, A.triggerHappyShots);
  if (s !== null) {
    const accuracy = (ship: number) => t.shotHits[ship]! / t.shots[ship]!;
    const worst = t.shots.every((n, ship) => ship === s || n === 0 || accuracy(ship) > accuracy(s!));
    give("triggerHappy", worst ? s : null, `${t.shots[s]} shots, ${Math.round(accuracy(s) * 100)}% hit`);
  }
  s = leader(t.packs, A.packRatPacks);
  give("packRat", s, `packs picked up (${at(t.packs, s)})`);
  s = leader(t.longestHold, A.hoarderSeconds);
  give("hoarder", s, `held a pack ${secs(at(t.longestHold, s))}`);
  const shield = world.ships.map((ship) => ship.shieldEnergy);
  s = leader(shield, A.shieldHogEnergy);
  give("shieldHog", s, `energy on the shield (${Math.round(at(shield, s))})`);
  const boost = world.ships.map((ship) => ship.boostEnergy);
  s = leader(boost, A.speedDemonEnergy);
  give("speedDemon", s, `energy on boost (${Math.round(at(boost, s))})`);
  const health = world.ships.map((ship) => ship.health);
  s = leader(health, TUNING.ship.maxHealth * A.closeShaveHealth - 1e-9, afloat, true);
  give("closeShave", s, `afloat with ${Math.round(at(health, s))} health`);
  s = leader(t.storm, A.stormChaserSeconds, (ship) => !t.sunkByStorm[ship]);
  give("stormChaser", s, `in the storm ${secs(at(t.storm, s))}`);
  s = leader(t.whirlpool, A.whirlpoolTouristSeconds);
  give("whirlpoolTourist", s, `in whirlpools ${secs(at(t.whirlpool, s))}`);
  return earned;
}

/**
 * The awards shown: shuffled with the match's seed, then taken in that order, at most one per crew and at most
 * `maxPerMatch` (so a crew whose best award was tied away still gets another it earned).
 */
export function pickAwards(earned: readonly EarnedAward[], seed: number): EarnedAward[] {
  let state = (seed ^ 0x5bd1e995) >>> 0;
  const order = earned.map((award) => {
    const roll = nextRandom(state);
    state = roll.state;
    return { award, key: roll.value };
  }).sort((a, b) => a.key - b.key);
  const picked: EarnedAward[] = [];
  for (const { award } of order) {
    if (picked.length >= A.maxPerMatch) break;
    if (!picked.some((p) => p.ship === award.ship)) picked.push(award);
  }
  return picked;
}
