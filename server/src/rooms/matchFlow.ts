import { Phase } from "@sink-or-sail/shared";

/** Only the host starts a match, and only when none is on. */
export function canStart(sessionId: string, hostId: string, phase: string): boolean {
  return sessionId === hostId && (phase === Phase.Waiting || phase === Phase.Over);
}

/** During the countdown or a match, seated players can't switch; seatless players may take a free seat. */
export function canChangeSeat(phase: string, isSeated: boolean): boolean {
  const matchOn = phase === Phase.Countdown || phase === Phase.Running;
  return !matchOn || !isSeated;
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
