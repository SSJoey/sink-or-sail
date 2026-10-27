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
  /** The crew's two pack slots, each a pack type or "" when empty: the pilot's (a mine) and the gunner's (a torpedo or EMP). */
  pilotPack: t.string().default(""),
  gunnerPack: t.string().default(""),
  /** Seconds left of an EMP (no fire, boost, shield or packs). */
  disabled: t.float32().default(0),
  /** EMPs this ship has fired this match; clients draw the ring when it goes up. */
  empsFired: t.uint16().default(0),
  /** Stage 2: closing-storm hits taken (clients flash the hull red on each). */
  stormHits: t.uint16().default(0),
  /** Stage 2: kraken hits taken while held (clients flash the hull red on each, like storm hits). */
  krakenHits: t.uint16().default(0),
  /** Last Afloat: sinkings the ship can still take; -1 in Sink Count. */
  livesLeft: t.int8().default(-1),
  /** Last Afloat: sunk on its last life, gone for the rest of the match. */
  out: t.boolean().default(false),
  /** What sank this ship last (a SinkCause), "" for nothing yet. */
  sunkCause: t.string().default(""),
}, "ShipState");
export type ShipState = SchemaType<typeof ShipState>;

export const ShotState = schema({
  x: t.float32(),
  y: t.float32(),
  /** Direction of travel (radians). */
  angle: t.float32(),
}, "ShotState");
export type ShotState = SchemaType<typeof ShotState>;

export const PackState = schema({
  x: t.float32(),
  y: t.float32(),
  type: t.string(),
  /** True while the spot is only glowing (the pack can't be picked up yet). */
  signalled: t.boolean(),
  /** Seconds before it disappears unpicked (clients blink it near the end). */
  lifeLeft: t.float32(),
}, "PackState");
export type PackState = SchemaType<typeof PackState>;

/** Stage 2: a wreck still standing; clients draw its hull from the match's layout (keyed by its index there). */
export const WreckState = schema({
  health: t.float32(),
  /** Whether it holds a pack (shown as a glint); the type stays hidden. */
  hasPack: t.boolean(),
}, "WreckState");
export type WreckState = SchemaType<typeof WreckState>;

/** Stage 2: a dynamic hazard on the sea (a moving storm, a whirlpool or a kraken). */
export const HazardState = schema({
  kind: t.string(),
  /** "signalled", "active" or "fading". */
  phase: t.string(),
  x: t.float32(),
  y: t.float32(),
  /** The way it moves (radians). */
  heading: t.float32(),
  /** Seconds left in its phase (clients fade a fading storm out with it). */
  timeLeft: t.float32(),
  /** Whirlpool: 1 clockwise, -1 anticlockwise; 0 for other kinds. */
  spin: t.int8(),
  /** Kraken: its health (clients flash it when it drops) and the ship it holds (-1 for none). */
  health: t.float32(),
  holding: t.int8().default(-1),
}, "HazardState");
export type HazardState = SchemaType<typeof HazardState>;

/** Stage 2 (Last Afloat): an out crew's ghost, once it has appeared. */
export const GhostState = schema({
  x: t.float32(),
  y: t.float32(),
  /** The way it last moved (radians). */
  heading: t.float32(),
}, "GhostState");
export type GhostState = SchemaType<typeof GhostState>;

export const MineState = schema({
  x: t.float32(),
  y: t.float32(),
  /** Ship that dropped it. */
  owner: t.int8(),
  armed: t.boolean(),
}, "MineState");
export type MineState = SchemaType<typeof MineState>;

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
  /** Room setting for the next match (host toggle); a running match keeps the setting it started with. */
  packsEnabled: t.boolean().default(true),
  /** Room settings for the next match (host only, Stage 2): the mode and Last Afloat's lives. */
  mode: t.string().default("sinkCount"),
  lives: t.uint8().default(TUNING.lastAfloat.lives),
  /** The mode of the current (or last) match, which the game view draws by. */
  matchMode: t.string().default("sinkCount"),
  /** Room setting for the next match: a layout id or "random" (host only, Stage 2). */
  layout: t.string().default("oneIsland"),
  /** The layout of the current (or last) match, which clients draw. */
  matchLayout: t.string().default("oneIsland"),
  /** Room settings for the next match (host only, Stage 2): hazards on/off and the amount of reefs. */
  hazardsEnabled: t.boolean().default(true),
  reefs: t.string().default("all"),
  /** The reefs of the current (or last) match: "none" with hazards off. Clients draw the layout's reefs from it. */
  matchReefs: t.string().default("none"),
  /** Stage 2 closing storm: whether the current (or last) match has one, its times (match seconds) and the safe circle's radius now. */
  matchStorm: t.boolean().default(false),
  stormStartsAt: t.float32(),
  stormClosedAt: t.float32(),
  stormRadius: t.float32(),
  /** Keyed by pack id (packs released from wrecks too). */
  packs: t.map(PackState),
  /** Stage 2: wrecks still standing, keyed by their index in the layout's wrecks. */
  wrecks: t.map(WreckState),
  /** Stage 2: dynamic hazards on the sea, keyed by hazard id. */
  hazards: t.map(HazardState),
  /** Stage 2 (Last Afloat): ghosts that have appeared, keyed by their crew's ship id. */
  ghosts: t.map(GhostState),
  /** Keyed by mine id. */
  mines: t.map(MineState),
  /** Keyed by torpedo id. */
  torpedoes: t.map(ShotState),
}, "CrewState");
export type CrewState = SchemaType<typeof CrewState>;
