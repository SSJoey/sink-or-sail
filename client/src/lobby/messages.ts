import { CREWS, JoinError, MAX_PLAYERS, NAME_MAX_LENGTH, RejectReason, type RejectedMessage } from "@sink-or-sail/shared";

const GENERAL = "Could not connect. Check the Wi-Fi and try again.";

/** Turns a failed create/join into a sentence for the player. */
export function joinErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes(JoinError.InvalidName)) return `Enter a name of 1–${NAME_MAX_LENGTH} characters.`;
  if (message.includes(JoinError.NameTaken)) return "That name is already in this room.";
  if (message.includes(JoinError.SpectatorsFull)) return "That room already has 4 watching.";
  if (message.includes(JoinError.RoomFull)) return "That room is full.";
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
    case RejectReason.CrewNotInMatch: return "That crew joins from the next match.";
    case RejectReason.CrewsNeedPlayers: return "Every crew needs a player for Last Afloat.";
    case RejectReason.NameTaken: return joinErrorText(new Error(JoinError.NameTaken));
    case RejectReason.InvalidName: return joinErrorText(new Error(JoinError.InvalidName));
    case RejectReason.NameLocked: return "Names can be changed between matches.";
    case RejectReason.NoPartnerWaiting: return "Nobody is waiting for a partner yet: the next player to join will be paired with you.";
    case RejectReason.AlreadyPaired: return "You already have a partner.";
    case RejectReason.NoFreeCrew: return `There are already ${CREWS.length} crews.`;
    case RejectReason.AlreadyAlone: return "You're already in a crew of your own.";
    case RejectReason.RoomFull: return `The room already has ${MAX_PLAYERS} players: keep watching for now.`;
    case RejectReason.NoBot: return "Your crew has no bot.";
    case RejectReason.NotTypePicker: return "Your pilot picks the ship.";
    case RejectReason.ShipTypeLocked: return "The ship can be changed between matches, before you're Ready.";
  }
}
