import type { Polygon } from "./geometry.ts";
import type { LayoutId } from "./layouts.ts";
import type { Vec } from "./vec.ts";

export interface PilotInput {
  /** Wanted direction; length 0–1 sets speed (longer vectors are clamped). */
  steer: Vec;
  boost: boolean;
  /** Pack button (Stage 1); a mine is the pilot's pack. */
  pack?: boolean;
  /** Stage 2: steering the crew's ghost (sent once the crew is out). */
  ghost?: Vec;
}

export interface GunnerInput {
  /** Aim direction in sea coordinates; a zero vector keeps the last aim. */
  aim: Vec;
  fire: boolean;
  shield: boolean;
  /** Pack button (Stage 1); torpedo and EMP are the gunner's packs. */
  pack?: boolean;
  /** Stage 2: steering the crew's ghost (sent once the crew is out). */
  ghost?: Vec;
}

export interface ShipInput {
  pilot: PilotInput;
  gunner: GunnerInput;
  /** Stage 2: the crew's ghost's direction (from whichever crewmate moved it last); none means it stays put. */
  ghost?: Vec;
}

/** Stage 2 (Last Afloat): a crew that is out becomes one shared ghost, which moves freely and touches nothing. */
export interface Ghost {
  /** The crew's ship id. */
  ship: number;
  pos: Vec;
  /** The way it last moved (radians). */
  heading: number;
  /** Seconds until it appears (it starts where the ship sank, after `ghost.appearAfter`); 0 once it has. */
  appearIn: number;
}

export const NO_INPUT: ShipInput = {
  pilot: { steer: { x: 0, y: 0 }, boost: false },
  gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false },
};

export type PackType = "mine" | "torpedo" | "emp" | "health";

/** Stage 2: Sink Count (4 minutes, most sinkings) or Last Afloat (lives; last ship in the match wins). */
export const GAME_MODES = ["sinkCount", "lastAfloat"] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** What sank a ship. A mine set off by a shot or a torpedo counts as that weapon; "ownMine" is a ship's own mine it sailed into. */
export type SinkCause = "shot" | "mine" | "ownMine" | "torpedo" | "bump" | "reef" | "wreck" | "storm" | "kraken";

/** A pack on the map. While `signalLeft` > 0 its spot is glowing and it can't be picked up yet. */
export interface Pack {
  id: number;
  /** Index into the world's pack spots. */
  spot: number;
  type: PackType;
  signalLeft: number;
  /** Seconds left once it has appeared (it stays at the full lifetime while glowing); it disappears at 0. */
  lifeLeft: number;
}

/** Stage 2: a pack released from a destroyed wreck. It lies where the wreck was, can be taken at once and doesn't count toward the map's pack limit. */
export interface WreckPack {
  id: number;
  /** The wreck it came from. */
  wreck: number;
  pos: Vec;
  type: PackType;
  /** Seconds left; it disappears at 0, like other packs. */
  lifeLeft: number;
}

/** Stage 2: a shipwreck, solid like a rock until its health runs out (then it's gone for the match). */
export interface Wreck {
  /** Index into the layout's wrecks. */
  id: number;
  pos: Vec;
  /** The hull: blocks ships, shots, torpedoes and mine drops. */
  hull: Polygon;
  health: number;
  /** The pack it releases when destroyed, or null (drawn with the seed at the match start; none with packs off). */
  pack: PackType | null;
}

/** Stage 2 dynamic hazards (on the hazard timer): the moving storm, the whirlpool and the kraken. */
export type HazardKind = "movingStorm" | "whirlpool" | "kraken";
/** Signalled: its spot shows, it doesn't move or act. Active: it moves and acts. Fading: it still moves but no longer acts. */
export type HazardPhase = "signalled" | "active" | "fading";
export interface Hazard {
  id: number;
  kind: HazardKind;
  pos: Vec;
  /** The way it moves (radians). */
  heading: number;
  phase: HazardPhase;
  /** Seconds left in the current phase. */
  timeLeft: number;
  /** Whirlpool: which way it turns on screen, 1 clockwise, -1 anticlockwise (0 for other kinds). */
  spin: number;
  /** Kraken: its health (shots and torpedoes hurt it), the ship it holds (null for none) and seconds of the hold left. */
  health?: number;
  holding?: number | null;
  holdLeft?: number;
}

/** When the closing storm starts closing and reaches its final circle (match seconds). */
export interface StormTimes {
  startsAt: number;
  closedAt: number;
}

/** What damaged a wreck. */
export type WreckWeapon = "shot" | "torpedo" | "mine" | "bump";

/** A dropped mine. Armed once `age` reaches the arm time; gone at its lifetime or when it goes off. */
export interface Mine {
  id: number;
  /** Ship that dropped it. */
  owner: number;
  pos: Vec;
  /** Seconds since it was dropped. */
  age: number;
}

/** A torpedo in the water: a point moving in a straight line at fixed speed. */
export interface Torpedo {
  id: number;
  owner: number;
  pos: Vec;
  vel: Vec;
}

export interface Ship {
  id: number;
  pos: Vec;
  vel: Vec;
  /** Direction the bow points (radians). */
  heading: number;
  /** Direction the turret points, in sea coordinates (radians). */
  turret: number;
  health: number;
  energy: number;
  /** Set when the bar runs empty; boost and shield stay off until energy reaches the restart threshold. */
  energyLocked: boolean;
  boosting: boolean;
  shielding: boolean;
  /** Seconds until the gun can fire again. */
  fireCooldown: number;
  /** Seconds of respawn protection left. */
  protection: number;
  sunk: boolean;
  /** Seconds until a sunk ship reappears. */
  respawnIn: number;
  /** Score: enemy ships this ship has sunk. */
  sinkings: number;
  /** Energy spent on boost and on shield this match (for the match log). */
  boostEnergy: number;
  shieldEnergy: number;
  /** The pilot's pack slot (a mine) and the gunner's (a torpedo or EMP); health is used on pickup and needs no slot. */
  pilotPack: PackType | null;
  gunnerPack: PackType | null;
  /** Seconds left of an EMP: no fire, boost, shield or packs (steering still works). */
  disabled: number;
  /** Last Afloat: sinkings this ship can still take, counting the one that puts it out (null in Sink Count). */
  livesLeft: number | null;
  /** Last Afloat: sunk on its last life; it stays sunk for the rest of the match. */
  out: boolean;
  /** Stage 2: its centre was over a reef after the last step (entering one hurts). */
  onReef: boolean;
}

export interface Shot {
  id: number;
  owner: number;
  pos: Vec;
  vel: Vec;
  travelled: number;
}

export interface World {
  /** Seconds since the match started. */
  time: number;
  ships: Ship[];
  shots: Shot[];
  nextShotId: number;
  /** Ship pairs touching after the last step, as "a:b" with a < b, and ships touching a wreck, as "a:w3"; bumps hurt only when contact starts. */
  contacts: string[];
  over: boolean;
  /** Stage 2: set for the whole match. */
  mode: GameMode;
  /** Stage 2: the match's island layout and its islands (One Island by default). */
  layout: LayoutId;
  islands: readonly Polygon[];
  /** Stage 2: hazards on for the whole match; `reefs` are the match's reefs (none with hazards off). */
  hazardsOn: boolean;
  reefs: readonly Polygon[];
  /** Stage 2: wrecks still standing (none with hazards off), and packs released from destroyed ones. */
  wrecks: Wreck[];
  wreckPacks: WreckPack[];
  /** Stage 2: the closing storm's times (Last Afloat with hazards on), or null for no storm. */
  storm: StormTimes | null;
  /** Stage 2 dynamic hazards: the ones on the sea, and the timer (seconds to the next signal, counting only while
   *  fewer than the most allowed are on the sea; null for none this match: hazards off, or turned off for a test). */
  hazards: Hazard[];
  nextHazardId: number;
  nextHazardIn: number | null;
  /** The hazard timer's own seeded generator state, so packs are the same with hazards on or off. */
  hazardRng: number;
  /** Stage 2 (Last Afloat): the ghosts of crews that are out. */
  ghosts: Ghost[];
  /** Stage 2 haunting (Last Afloat with hazards on, else null): each zone's meter (0–1) and seconds before it can fill again. */
  haunting: { meters: number[]; cooldowns: number[] } | null;
  /** Ships inside an active moving storm or whirlpool, as "ship:hazard". */
  hazardContacts: string[];
  /** Stage 1: packs spawn only when on (set for the whole match). */
  packsOn: boolean;
  /** Seeded generator state; the same seed gives the same packs. */
  rng: number;
  packs: Pack[];
  /** Where packs can spawn: the layout's 2-ship or 3-ship pack spots. */
  packSpots: readonly Vec[];
  nextPackId: number;
  /** Seconds until the next spot is signalled; null while waiting (a pack is glowing, or the map is full). */
  nextSignalIn: number | null;
  mines: Mine[];
  nextMineId: number;
  torpedoes: Torpedo[];
  nextTorpedoId: number;
}

export type SimEvent =
  | { type: "shotFired"; ship: number; shot: number }
  | { type: "hit"; attacker: number; target: number; damage: number }
  | { type: "shotBlocked"; attacker: number; target: number }
  | { type: "bump"; ships: [number, number]; damage: [number, number] }
  | { type: "boostStarted"; ship: number }
  | { type: "shieldRaised"; ship: number }
  | { type: "energyEmpty"; ship: number }
  | { type: "energyRestored"; ship: number }
  | { type: "protectionEnded"; ship: number }
  /** `livesLeft` only in Last Afloat. */
  | { type: "sunk"; ship: number; by: number | null; cause: SinkCause; livesLeft?: number }
  /** Last Afloat: sunk on its last life. */
  | { type: "crewOut"; ship: number }
  /** Last Afloat: an out crew's ghost appears (where its ship sank). */
  | { type: "ghostStarted"; ship: number; pos: Vec }
  /** Stage 2: a zone's full haunting meter set off a hazard; `ghosts` are the ships whose ghosts were in the zone. */
  | { type: "hauntingTriggered"; zone: number; hazard: number; ghosts: number[] }
  /** Stage 2: a ship's centre entered a reef (not counted while protected). */
  | { type: "reefHit"; ship: number; damage: number }
  /** Stage 2 wrecks: `by` is the ship credited (null for none). A ram also gives the ramming ship's damage (0 while shielded or protected). */
  | { type: "wreckHit"; wreck: number; by: number | null; weapon: WreckWeapon; damage: number; shipDamage?: number }
  | { type: "wreckDestroyed"; wreck: number; by: number | null }
  | { type: "wreckPackReleased"; wreck: number; pack: number; packType: PackType }
  /** Stage 2 closing storm: it starts closing, reaches its final circle, and hurts a ship outside the circle (each tick). */
  | { type: "stormStarted" }
  | { type: "stormClosed" }
  | { type: "stormDamage"; ship: number; damage: number }
  /** Stage 2 dynamic hazards: signalled (where, and the way it will move), started acting, and stopped acting (then it fades). */
  | { type: "hazardSignalled"; hazard: number; kind: HazardKind; pos: Vec; heading: number; spin?: number }
  | { type: "hazardStarted"; hazard: number; kind: HazardKind }
  /** Reasons: its time is up, a storm's centre left the sea, a kraken's grab ended, or a kraken was shot to 0. */
  | { type: "hazardEnded"; hazard: number; kind: HazardKind; reason: "time" | "edge" | "grab" | "shot" }
  /** A ship's centre entered or left an active moving storm (leaving includes the storm ending and the ship sinking). */
  | { type: "stormEntered"; ship: number; hazard: number }
  | { type: "stormLeft"; ship: number; hazard: number }
  /** A ship's centre entered or left an active whirlpool's reach (leaving includes it ending and the ship sinking). */
  | { type: "whirlpoolEntered"; ship: number; hazard: number }
  | { type: "whirlpoolLeft"; ship: number; hazard: number }
  /** A kraken grabs a ship, hurts the ship it holds (each tick), lets it go, and is hit by a shot or torpedo (`by`: the firing ship). */
  | { type: "krakenGrab"; ship: number; hazard: number }
  | { type: "krakenDamage"; ship: number; hazard: number; damage: number }
  | { type: "krakenReleased"; ship: number; hazard: number; reason: "time" | "shot" | "sunk" }
  | { type: "krakenHit"; hazard: number; by: number; weapon: "shot" | "torpedo"; damage: number }
  | { type: "respawned"; ship: number; pos: Vec }
  /** "lastAfloat": one ship (or none) left in a Last Afloat match; "time": the clock ran out. */
  | { type: "matchEnded"; winner: number | null; reason: "time" | "lastAfloat" }
  | { type: "packSignalled"; pack: number; spot: number; packType: PackType }
  | { type: "packSpawned"; pack: number; spot: number; packType: PackType }
  /** A pack nobody picked up in time; `spot` is null for a pack released from a wreck. */
  | { type: "packExpired"; pack: number; spot: number | null; packType: PackType }
  | { type: "packPickedUp"; ship: number; pack: number; packType: PackType }
  | { type: "packLost"; ship: number; packType: PackType }
  | { type: "healthRestored"; ship: number; amount: number }
  | { type: "packUsed"; ship: number; packType: PackType; role: "pilot" | "gunner" }
  | { type: "mineDropped"; mine: number; owner: number; pos: Vec }
  | { type: "mineArmed"; mine: number; owner: number }
  /** `shooter` is the ship whose shot set it off, or null when a ship sailed into it. */
  | { type: "mineTriggered"; mine: number; owner: number; shooter: number | null; hits: { ship: number; damage: number; ownMine: boolean }[] }
  | { type: "mineExpired"; mine: number; owner: number }
  | { type: "torpedoFired"; torpedo: number; owner: number; pos: Vec; heading: number }
  | { type: "torpedoHit"; torpedo: number; attacker: number; target: number; damage: number; shieldHalved: boolean }
  | { type: "empFired"; ship: number; caught: number[] }
  /** A torpedo that didn't hit a ship: stopped by the island, the sea edge or a wreck, or used up setting off a mine. */
  | { type: "torpedoEnded"; torpedo: number; owner: number; reason: "island" | "edge" | "mine" | "wreck" | "kraken" };
