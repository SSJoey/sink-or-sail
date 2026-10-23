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
  phase: t.string().default(Phase.Waiting),
  timeLeft: t.float32().default(TUNING.match.duration),
  ships: t.array(ShipState),
  /** Keyed by shot id. */
  shots: t.map(ShotState),
}, "CrewState");
export type CrewState = SchemaType<typeof CrewState>;
