import { Phase } from "@sink-or-sail/shared";

/** Only the host starts a match, and only when none is on. */
export function canStart(sessionId: string, hostId: string, phase: string): boolean {
  return sessionId === hostId && (phase === Phase.Waiting || phase === Phase.Over);
}

/** During the countdown, a match or a pause, seated players can't switch; seatless players may take a free seat. */
export function canChangeSeat(phase: string, isSeated: boolean): boolean {
  const matchOn = phase === Phase.Countdown || phase === Phase.Running || phase === Phase.Paused;
  return !matchOn || !isSeated;
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
