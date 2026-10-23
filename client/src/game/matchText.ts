import { Phase, TUNING } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";

const crewLabel = (crew: number) => {
  const style = CREW_STYLES[crew] ?? CREW_STYLES[0];
  return `${style.symbol} ${style.name}`;
};

/** "3", "2", "1" during the countdown, "Go!" for the first second of the match, otherwise nothing. */
export function countdownLabel(phase: string, countdown: number, timeLeft: number): string | null {
  if (phase === Phase.Countdown) return String(Math.max(1, Math.ceil(countdown)));
  if (phase === Phase.Running && timeLeft > TUNING.match.duration - 1) return "Go!";
  return null;
}

export const sinkBanner = (sunkBy: number) => (sunkBy >= 0 ? `Sunk by ${crewLabel(sunkBy)}` : "Sunk!");

export const respawnText = (respawnIn: number) => `Back in ${Math.max(1, Math.ceil(respawnIn))}`;

export const resultTitle = (winner: number) => (winner >= 0 ? `${crewLabel(winner)} wins!` : "Draw!");

export interface ScoreRow {
  label: string;
  names: string;
  sinkings: number;
}

/** One row per crew: its label, players (pilot first) and sinkings. */
export function scoreRows(sinkings: readonly number[], players: readonly { name: string; crew?: number; role?: string }[]): ScoreRow[] {
  return sinkings.map((count, crew) => {
    const aboard = players
      .filter((p) => p.crew === crew)
      .sort((a, b) => (a.role === "pilot" ? -1 : b.role === "pilot" ? 1 : 0))
      .map((p) => p.name);
    return { label: crewLabel(crew), names: aboard.join(" & ") || "—", sinkings: count };
  });
}

/** While protected, the ship blinks `hz` times a second; `protection` counts down. */
export function blinkVisible(protection: number, hz: number): boolean {
  if (protection <= 0) return true;
  return Math.floor((TUNING.respawn.protection - protection) * hz * 2 + 1e-9) % 2 === 0;
}
