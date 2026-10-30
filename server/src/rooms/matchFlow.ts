import { GAME_MODES, MAX_BOT_SHIPS, Phase, RANDOM_LAYOUT, TUNING, isLayoutId, isReefAmount, isShipType, type GameMode, type LayoutId, type ReefAmount, type ShipType } from "@sink-or-sail/shared";

/** Only the host starts a match, and only when none is on. */
export function canStart(sessionId: string, hostId: string, phase: string): boolean {
  return sessionId === hostId && (phase === Phase.Waiting || phase === Phase.Over);
}

/**
 * During the countdown, a match or a pause, nobody changes seat: seated players are locked in, and seatless
 * players (who joined mid-match) wait for the next round (Stage 3 slice 3).
 */
export function canChangeSeat(phase: string, _isSeated: boolean): boolean {
  return !(phase === Phase.Countdown || phase === Phase.Running || phase === Phase.Paused);
}

/** During a match, only crews with a ship can be joined (no ship for Crew 3 if it was empty at the start). */
export function crewHasShip(phase: string, crew: number, shipCount: number): boolean {
  const matchOn = phase === Phase.Countdown || phase === Phase.Running || phase === Phase.Paused;
  return !matchOn || crew < shipCount;
}

/** The longest-present player (lowest join order) becomes host; "" if the room is empty. */
export function nextHost(joinOrder: ReadonlyMap<string, number>): string {
  let best = "";
  let bestOrder = Infinity;
  for (const [sessionId, order] of joinOrder) {
    if (order < bestOrder) {
      best = sessionId;
      bestOrder = order;
    }
  }
  return best;
}

/** Any seated player can pause during the countdown or match. */
export function canPause(phase: string, isSeated: boolean): boolean {
  return isSeated && (phase === Phase.Countdown || phase === Phase.Running);
}

/** Only the host resumes a paused match. */
export function canResume(sessionId: string, hostId: string, phase: string): boolean {
  return sessionId === hostId && phase === Phase.Paused;
}

/** Only the host ends a match early: during the countdown, the match, or a pause. */
export function canEndMatch(sessionId: string, hostId: string, phase: string): boolean {
  return sessionId === hostId && (phase === Phase.Countdown || phase === Phase.Running || phase === Phase.Paused);
}

/** Only the host switches packs on or off, and only between matches; it applies from the next match. */
export function canSetPacks(sessionId: string, hostId: string, phase: string): boolean {
  return sessionId === hostId && (phase === Phase.Waiting || phase === Phase.Over);
}

/** A third ship only when someone sits in Crew 3 as the match starts. `crews` has one entry per seated player. */
export function shipCount(crews: readonly number[]): 2 | 3 {
  return crews.includes(2) ? 3 : 2;
}

/** Last Afloat needs a player in every crew that will have a ship, so no ship is left unmanned. */
export function everyCrewManned(crews: readonly number[]): boolean {
  const ships = shipCount(crews);
  for (let crew = 0; crew < ships; crew++) if (!crews.includes(crew)) return false;
  return true;
}

const onlyKey = (message: unknown, key: string): unknown =>
  typeof message === "object" && message !== null && Object.keys(message).length === 1 ? (message as Record<string, unknown>)[key] : undefined;

/** The mode from a SetMode message ({ mode }), or null if it isn't valid. */
export function readMode(message: unknown): GameMode | null {
  const mode = onlyKey(message, "mode");
  return (GAME_MODES as readonly unknown[]).includes(mode) ? (mode as GameMode) : null;
}

/** The lives from a SetLives message ({ lives }), or null unless a whole number in the allowed range. */
export function readLives(message: unknown): number | null {
  const lives = onlyKey(message, "lives");
  const { minLives, maxLives } = TUNING.lastAfloat;
  return typeof lives === "number" && Number.isInteger(lives) && lives >= minLives && lives <= maxLives ? lives : null;
}

/** The bot ships setting from a SetBotShips message ({ count: 0–2 }); null if not valid. */
export function readBotShips(message: unknown): number | null {
  const count = onlyKey(message, "count");
  return typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= MAX_BOT_SHIPS ? count : null;
}

/** The layout setting from a SetLayout message ({ layout }): a layout id or "random"; null if not valid. */
export function readLayout(message: unknown): LayoutId | typeof RANDOM_LAYOUT | null {
  const layout = onlyKey(message, "layout");
  return layout === RANDOM_LAYOUT || isLayoutId(layout) ? layout : null;
}

/** The reefs setting from a SetReefs message ({ reefs: "none" | "few" | "all" }); null if not valid. */
export function readReefs(message: unknown): ReefAmount | null {
  const reefs = onlyKey(message, "reefs");
  return isReefAmount(reefs) ? reefs : null;
}

/** The setting from an on/off message ({ on: boolean }), as for Packs and Hazards; null if not valid. */
export function readOnOff(message: unknown): boolean | null {
  const on = onlyKey(message, "on");
  return typeof on === "boolean" ? on : null;
}

/** Stage 3: the Ready from a SetReady message ({ ready: boolean }); null if not valid. */
export function readReady(message: unknown): boolean | null {
  const ready = onlyKey(message, "ready");
  return typeof ready === "boolean" ? ready : null;
}

/** Stage 5: the type from a SetShipType message ({ type }); null if not one of the five. */
export function readShipType(message: unknown): ShipType | null {
  const type = onlyKey(message, "type");
  return isShipType(type) ? type : null;
}
