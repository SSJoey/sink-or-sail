import { schema, t, type SchemaType } from "@colyseus/schema";
import { Phase, TUNING } from "@sink-or-sail/shared";

/** A player in the room. `crew` and `role` are unset until they take a seat. */
export const Player = schema({
  name: t.string(),
  crew: t.int8().optional(),
  role: t.string().optional(),
  connected: t.boolean().default(true),
}, "Player");
export type Player = SchemaType<typeof Player>;

/** What clients need to draw a ship; mirrors the simulation's Ship (index = ship id = crew). */
export const ShipState = schema({
  x: t.float32(),
  y: t.float32(),
  heading: t.float32(),
  turret: t.float32(),
  health: t.float32(),
  energy: t.float32(),
  boosting: t.boolean(),
  shielding: t.boolean(),
  /** Seconds of respawn protection left. */
  protection: t.float32(),
  sunk: t.boolean(),
  respawnIn: t.float32(),
  sinkings: t.uint8(),
  /** Ship id that sank this ship last; -1 for nobody. */
  sunkBy: t.int8().default(-1),
  /** Hits taken this match; clients flash the ship when it goes up. */
  hits: t.uint16().default(0),
}, "ShipState");
export type ShipState = SchemaType<typeof ShipState>;

export const ShotState = schema({
  x: t.float32(),
  y: t.float32(),
  /** Direction of travel (radians). */
  angle: t.float32(),
}, "ShotState");
export type ShotState = SchemaType<typeof ShotState>;

export const CrewState = schema({
  /** Keyed by session id. */
  players: t.map(Player),
  /** Session id of the host, who starts matches. */
  hostId: t.string(),
  phase: t.string().default(Phase.Waiting),
  /** Name of the player who paused the match (while paused). */
  pausedBy: t.string(),
  /** Seconds of 3-2-1 countdown left. */
  countdown: t.float32(),
  timeLeft: t.float32().default(TUNING.match.duration),
  /** Last match's winning ship id; -1 for a draw or no result yet. */
  winner: t.int8().default(-1),
  ships: t.array(ShipState),
  /** Keyed by shot id. */
  shots: t.map(ShotState),
}, "CrewState");
export type CrewState = SchemaType<typeof CrewState>;
