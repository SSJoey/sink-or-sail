import { schema, t, type SchemaType } from "@colyseus/schema";

/** A player in the room. `crew` and `role` are unset until they take a seat. */
export const Player = schema({
  name: t.string(),
  crew: t.int8().optional(),
  role: t.string().optional(),
  connected: t.boolean().default(true),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const CrewState = schema({
  /** Keyed by session id. */
  players: t.map(Player),
}, "CrewState");
export type CrewState = SchemaType<typeof CrewState>;
