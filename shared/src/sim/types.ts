import type { Vec } from "./vec.ts";

export interface PilotInput {
  /** Wanted direction; length 0–1 sets speed (longer vectors are clamped). */
  steer: Vec;
  boost: boolean;
}

export interface GunnerInput {
  /** Aim direction in sea coordinates; a zero vector keeps the last aim. */
  aim: Vec;
  fire: boolean;
  shield: boolean;
}

export interface ShipInput {
  pilot: PilotInput;
  gunner: GunnerInput;
}

export const NO_INPUT: ShipInput = {
  pilot: { steer: { x: 0, y: 0 }, boost: false },
  gunner: { aim: { x: 0, y: 0 }, fire: false, shield: false },
};

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
  | { type: "sunk"; ship: number; by: number | null }
  | { type: "respawned"; ship: number; pos: Vec }
  | { type: "matchEnded"; winner: number | null };
