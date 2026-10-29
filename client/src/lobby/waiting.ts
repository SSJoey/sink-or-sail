import { TUNING, type Role } from "@sink-or-sail/shared";
import { formatClock } from "../game/hud.ts";

/** A player as the waiting screen sees them (Stage 3 slice 3). */
export interface WaitingPlayer {
  id: string;
  name: string;
  crew?: number;
  /** While waiting without a crew: the role wanted next round, and who they're paired with ("" for nobody). */
  nextRole: string;
  partner: string;
  /** Slice 9: chose Play with a bot for the next round. */
  withBot?: boolean;
}

export interface WaitingInput {
  players: readonly WaitingPlayer[];
  mode: string;
  timeLeft: number;
  matchStorm: boolean;
  stormStartsAt: number;
  stormClosedAt: number;
  ships: readonly { sunk: boolean }[];
}

/**
 * What a player waiting out a match sees: ships afloat; the time left (or, in Last Afloat with the storm, the time
 * until it closes in, then "Closing" / "Closed"); how many others wait; their chosen role and partner (or a bot); and the other
 * waiting players without a partner, to pair with.
 */
export function waitingView(input: WaitingInput, myId: string) {
  const waiting = input.players.filter((pl) => pl.crew === undefined);
  const me = waiting.find((pl) => pl.id === myId);
  const elapsed = TUNING.lastAfloat.duration - input.timeLeft;
  const clock = !input.matchStorm || input.mode !== "lastAfloat"
    ? { value: formatClock(input.timeLeft), label: "time left" }
    : elapsed < input.stormStartsAt
      ? { value: formatClock(input.stormStartsAt - elapsed), label: "until the storm" }
      : { value: elapsed < input.stormClosedAt ? "Closing" : "Closed", label: "storm" };
  return {
    afloat: input.ships.filter((s) => !s.sunk).length,
    clock,
    othersWaiting: waiting.filter((pl) => pl.id !== myId).length,
    nextRole: (me?.nextRole === "gunner" ? "gunner" : "pilot") as Role,
    partnerName: waiting.find((pl) => pl.id === me?.partner)?.name ?? null,
    withBot: me?.withBot === true,
    pairWith: me?.partner ? [] : waiting.filter((pl) => pl.id !== myId && pl.partner === "").map((pl) => ({ id: pl.id, name: pl.name })),
  };
}
