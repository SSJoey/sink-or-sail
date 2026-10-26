/** Colyseus room type name for a crew match (2 or 3 crews). */
export const ROOM_NAME = "crew";

export const CODE_LENGTH = 4;
/** A–Z without I and O, so codes can't be confused with 1 and 0. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Three crews of two. */
export const MAX_PLAYERS = 6;
export const NAME_MAX_LENGTH = 12;
/** How long a dropped player's seat is held for them. */
export const RECONNECT_WINDOW_SECONDS = 60;
/** A client sending more messages than this per second is disconnected (it can reconnect). */
export const MAX_MESSAGES_PER_SECOND = 60;

/** Crew 3 (index 2) has a ship only in matches it was seated for at the start. */
export const CREWS = [0, 1, 2] as const;
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
  /** Give up your seat and be unseated (locked for seated players during a match, like switching). */
  LeaveSeat: "leaveSeat",
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
} as const;

export const RejectReason = {
  SeatTaken: "seatTaken",
  InvalidSeat: "invalidSeat",
  /** Seated players can't switch seats while a match is on. */
  SeatLocked: "seatLocked",
  /** That crew has no ship in this match (Crew 3, when nobody sat in it at the start). */
  CrewNotInMatch: "crewNotInMatch",
  /** Last Afloat can't start while a crew with a ship has no player. */
  CrewsNeedPlayers: "crewsNeedPlayers",
} as const;
export type RejectReason = (typeof RejectReason)[keyof typeof RejectReason];

export interface RejectedMessage {
  reason: RejectReason;
}

/** Join errors, sent as the error message when a join is refused. */
export const JoinError = {
  InvalidName: "invalidName",
  NameTaken: "nameTaken",
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
