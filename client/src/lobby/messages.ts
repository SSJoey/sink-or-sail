import { JoinError, NAME_MAX_LENGTH, RejectReason, type RejectedMessage } from "@sink-or-sail/shared";

const GENERAL = "Could not connect. Check the Wi-Fi and try again.";

/** Turns a failed create/join into a sentence for the player. */
export function joinErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes(JoinError.InvalidName)) return `Enter a name of 1–${NAME_MAX_LENGTH} characters.`;
  if (message.includes(JoinError.NameTaken)) return "That name is already in this room.";
  // Colyseus matchmaker errors (code 522): an unknown room id, or a room locked because it is full.
  if (message.includes("not found")) return "No room with that code.";
  if (message.includes("is locked")) return "That room is full.";
  return GENERAL;
}

export function rejectedText(message: RejectedMessage): string {
  switch (message.reason) {
    case RejectReason.SeatTaken: return "That seat is taken.";
    case RejectReason.InvalidSeat: return "That seat doesn't exist.";
    case RejectReason.SeatLocked: return "Seats are locked during a match.";
    case RejectReason.CrewNotInMatch: return "Crew 3 joins from the next match.";
    case RejectReason.CrewsNeedPlayers: return "Every crew needs a player for Last Afloat.";
  }
}
