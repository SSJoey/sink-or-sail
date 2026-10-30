/** Colyseus room type name for a crew match (2 to 10 crews). */
export const ROOM_NAME = "crew";

export const CODE_LENGTH = 4;
/** A–Z without I and O, so codes can't be confused with 1 and 0. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Stage 5: ten crews of two. */
export const MAX_PLAYERS = 20;
/** Stage 3: spectators (a TV, a laptop, a host who only hosts) on top of the players. */
export const MAX_SPECTATORS = 4;
/** Stage 3 slice 10: the host's bot ships; Stage 5: up to 9 (one crew fewer than the most). */
export const MAX_BOT_SHIPS = 9;
export const NAME_MAX_LENGTH = 12;
/** How long a dropped player's seat is held for them. */
export const RECONNECT_WINDOW_SECONDS = 60;
/** A client sending more messages than this per second is disconnected (it can reconnect). */
export const MAX_MESSAGES_PER_SECOND = 60;

/**
 * Stage 5: ten crews. A match has a ship for every crew up to the highest one seated as it starts (at least 2); a crew
 * beyond that has no ship until the next match.
 */
export const CREWS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Crew = (typeof CREWS)[number];

export const ROLES = ["pilot", "gunner"] as const;
export type Role = (typeof ROLES)[number];

export interface Seat {
  crew: Crew;
  role: Role;
}

/** Messages a client may send to the room. */
export const ClientMessage = {
  TakeSeat: "takeSeat",
  /** Stage 3 crews (between matches): into the crew that has waited longest for a partner; to a new crew of your
   *  own ("Leave this crew"); and your Ready: { ready: boolean }. */
  FindPartner: "findPartner",
  LeaveCrew: "leaveCrew",
  SetReady: "setReady",
  /** Stage 3 slice 3, for a player waiting out a match: the role they want next round { role }, and who they pair
   *  with for it { player: sessionId }, "" to wait alone. */
  SetNextRole: "setNextRole",
  PairWith: "pairWith",
  /** Stage 3 slice 8: a player becomes a spectator (between matches), and a spectator a player ("Play next round"). */
  Watch: "watch",
  PlayNextRound: "playNextRound",
  /** Stage 3 slice 9: a bot takes your crew's free role (between matches), or, waiting out a match, plays with you
   *  next round; Remove bot takes it out (your crew waits for a partner again), or, waiting, changes your mind. */
  PlayWithBot: "playWithBot",
  RemoveBot: "removeBot",
  /** Stage 3 slice 10: how many bot ships, { count: 0–2 } (host only, between matches). */
  SetBotShips: "setBotShips",
  /** Start the match (host only). */
  Start: "start",
  /** The sender's role input; see input.ts. */
  Input: "input",
  /** Pause the match (any seated player). */
  Pause: "pause",
  /** Resume after a pause, with a countdown (host only). */
  Resume: "resume",
  /** End the match now with the current score (host only). */
  EndMatch: "endMatch",
  /** Packs on or off for the next match: { on: boolean } (host only, between matches). */
  SetPacks: "setPacks",
  /** Stage 2: the mode for the next match: { mode: "sinkCount" | "lastAfloat" } (host only, between matches). */
  SetMode: "setMode",
  /** Stage 2: Last Afloat lives for the next match: { lives: 1–5 } (host only, between matches). */
  SetLives: "setLives",
  /** Stage 2: the island layout for the next match: { layout: a LayoutId or "random" } (host only, between matches). */
  SetLayout: "setLayout",
  /** Stage 2: hazards on or off for the next match: { on: boolean } (host only, between matches). */
  SetHazards: "setHazards",
  /** Stage 2: reefs for the next match: { reefs: "none" | "few" | "all" } (host only, between matches). */
  SetReefs: "setReefs",
  /** Change your name, between matches (Stage 3). */
  SetName: "setName",
  /** Stage 5: the crew's ship type for the next match, { type } (the crew's picker only: see shipTypePicker; between
   *  matches, and not while the picker is Ready). */
  SetShipType: "setShipType",
} as const;

/** The host's layout setting: a layout, or Random (picked at each match start). */
export const RANDOM_LAYOUT = "random";

/** Match phase shown to clients. */
export const Phase = {
  Waiting: "waiting",
  Countdown: "countdown",
  Paused: "paused",
  Running: "running",
  Over: "over",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

/** Messages the room sends to a single client. */
export const ServerMessage = {
  Rejected: "rejected",
  /** Stage 4 slice 2: each tick's sound cues (a SoundCue list), to every client while the match runs. */
  Cues: "cues",
} as const;

/** Stage 4 slice 2: the sound effects. */
export const CUE_KINDS = [
  "shot", "hit", "blocked", "boost", "empty", "sunk", "respawn", "pickup", "health",
  "mine", "boom", "torpedo", "emp", "wreck", "reef", "hazard", "kraken", "bump",
] as const;
export type CueKind = (typeof CUE_KINDS)[number];
/** Heard only by the crew whose ship it is (everyone else's: by all, quieter unless it's their own ship). */
export const OWN_CREW_CUES: readonly CueKind[] = ["boost", "empty", "respawn", "pickup", "health", "reef"];
/** A sound cue: its kind and the ships it belongs to (none for a hazard's signal). Short keys: sent every tick. */
export type SoundCue = { k: CueKind; s: number[] };

export const RejectReason = {
  SeatTaken: "seatTaken",
  InvalidSeat: "invalidSeat",
  /** Seated players can't switch seats while a match is on. */
  SeatLocked: "seatLocked",
  /** That crew has no ship in this match (nobody sat in it, or a crew after it, at the start). */
  CrewNotInMatch: "crewNotInMatch",
  /** Last Afloat can't start while a crew with a ship has no player. */
  CrewsNeedPlayers: "crewsNeedPlayers",
  /** Stage 3 name changes: another player has that name (any case), it isn't 1–12 characters, or a match is on. */
  NameTaken: "nameTaken",
  InvalidName: "invalidName",
  NameLocked: "nameLocked",
  /** Stage 3 crews: Find me a partner with nobody waiting, or when you already have a partner; Leave this crew
   *  with every crew already in use, or when you're alone in yours. */
  NoPartnerWaiting: "noPartnerWaiting",
  AlreadyPaired: "alreadyPaired",
  NoFreeCrew: "noFreeCrew",
  AlreadyAlone: "alreadyAlone",
  /** Stage 3: Play next round with 6 players already. */
  RoomFull: "roomFull",
  /** Stage 3 slice 9: Remove bot when your crew has no bot. */
  NoBot: "noBot",
  /** Stage 5: a ship type from someone who isn't their crew's picker, or once they're Ready or a match is on. */
  NotTypePicker: "notTypePicker",
  ShipTypeLocked: "shipTypeLocked",
} as const;
export type RejectReason = (typeof RejectReason)[keyof typeof RejectReason];

export interface RejectedMessage {
  reason: RejectReason;
}

/** Join errors, sent as the error message when a join is refused. */
export const JoinError = {
  InvalidName: "invalidName",
  NameTaken: "nameTaken",
  /** Stage 3: 6 players already (spectators don't count), or 4 spectators already. */
  RoomFull: "roomFull",
  SpectatorsFull: "spectatorsFull",
} as const;

/** Uppercases and strips spaces; returns null unless the result is a valid code. */
export function normaliseCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/\s+/g, "").toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const char of code) {
    if (!CODE_ALPHABET.includes(char)) return null;
  }
  return code;
}

/** Trims spaces; returns null unless the result has 1–12 characters. */
export function normaliseName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  const length = [...name].length;
  return length >= 1 && length <= NAME_MAX_LENGTH ? name : null;
}

export function isSeat(value: unknown): value is Seat {
  if (typeof value !== "object" || value === null) return false;
  const { crew, role } = value as Record<string, unknown>;
  return (CREWS as readonly unknown[]).includes(crew) && (ROLES as readonly unknown[]).includes(role);
}

/**
 * Stage 5: who picks a crew's ship type: the pilot, or the gunner when the pilot is a bot (or the seat is empty); null
 * for a crew with no person in it (a bot ship, which sails a Frigate).
 */
export function shipTypePicker(pilot: { bot: boolean } | undefined, gunner: { bot: boolean } | undefined): Role | null {
  if (pilot && !pilot.bot) return "pilot";
  if (gunner && !gunner.bot) return "gunner";
  return null;
}
