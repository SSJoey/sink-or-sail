/** Who holds a seat, from this player's point of view. */
export type SeatHolder = "none" | "me" | "other";

/**
 * What tapping a seat does: take a free one, leave your own (tap it again), or nothing.
 * Seated players are locked in during a match; a seatless player may still take a free seat.
 */
export function seatAction(seat: { holder: SeatHolder; matchOn: boolean; iAmSeated: boolean }): "take" | "leave" | null {
  if (seat.matchOn && seat.iAmSeated) return null;
  if (seat.holder === "none") return "take";
  if (seat.holder === "me") return "leave";
  return null;
}

/** The Leave seat button shows only while seated and no match is on. */
export const leaveSeatShown = (room: { matchOn: boolean; iAmSeated: boolean }) => room.iAmSeated && !room.matchOn;
