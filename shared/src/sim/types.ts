import type { Polygon } from "./geometry.ts";
import type { LayoutId } from "./layouts.ts";
import type { Vec } from "./vec.ts";

export interface PilotInput {
  /** Wanted direction; length 0–1 sets speed (longer vectors are clamped). */
  steer: Vec;
  boost: boolean;
  /** Pack button (Stage 1); a mine is the pilot's pack. */
  pack?: boolean;
}

export interface GunnerInput {
  /** Aim direction in sea coordinates; a zero vector keeps the last aim. */
  aim: Vec;
  fire: boolean;
  shield: boolean;
  /** Pack button (Stage 1); torpedo and EMP are the gunner's packs. */
  pack?: boolean;
}

export interface ShipInput {
  pilot: PilotInput;
  gunner: GunnerInput;
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
export type SinkCause = "shot" | "mine" | "ownMine" | "torpedo" | "bump" | "reef";

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
  /** Ship pairs touching after the last step, as "a:b" with a < b; bumps hurt only when contact starts. */
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
  /** Stage 2: a ship's centre entered a reef (not counted while protected). */
  | { type: "reefHit"; ship: number; damage: number }
  | { type: "respawned"; ship: number; pos: Vec }
  /** "lastAfloat": one ship (or none) left in a Last Afloat match; "time": the clock ran out. */
  | { type: "matchEnded"; winner: number | null; reason: "time" | "lastAfloat" }
  | { type: "packSignalled"; pack: number; spot: number; packType: PackType }
  | { type: "packSpawned"; pack: number; spot: number; packType: PackType }
  /** A pack nobody picked up in time. */
  | { type: "packExpired"; pack: number; spot: number; packType: PackType }
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
  /** A torpedo that didn't hit a ship: stopped by the island or the sea edge, or used up setting off a mine. */
  | { type: "torpedoEnded"; torpedo: number; owner: number; reason: "island" | "edge" | "mine" };
