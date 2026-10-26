import { Phase, TUNING } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";

const crewLabel = (crew: number) => {
  const style = CREW_STYLES[crew] ?? CREW_STYLES[0];
  return `${style.symbol} ${style.name}`;
};

/** "3", "2", "1" during the countdown, "Go!" for the first second of the match, otherwise nothing. */
export function countdownLabel(phase: string, countdown: number, timeLeft: number, duration: number = TUNING.match.duration): string | null {
  if (phase === Phase.Countdown) return String(Math.max(1, Math.ceil(countdown)));
  if (phase === Phase.Running && timeLeft > duration - 1) return "Go!";
  return null;
}

/** What sank the crew's ship; `cause` is a SinkCause, or "" when not known. */
export function sinkBanner(sunkBy: number, cause = ""): string {
  if (cause === "ownMine") return "Sunk by your own mine";
  if (cause === "reef") return "Wrecked on a reef";
  if (cause === "wreck") return "Wrecked on a shipwreck";
  if (sunkBy < 0) return "Sunk!";
  const crew = crewLabel(sunkBy);
  switch (cause) {
    case "shot": return `Sunk by ${crew}'s guns`;
    case "mine": return `Sunk by ${crew}'s mine`;
    case "torpedo": return `Sunk by ${crew}'s torpedo`;
    case "bump": return `Rammed by ${crew}`;
    default: return `Sunk by ${crew}`;
  }
}

/** Last Afloat: the banner a crew that is out keeps until the match ends. */
export function outBanner(sunkBy: number, cause: string): string {
  const text = sinkBanner(sunkBy, cause);
  return text === "Sunk!" ? "Out" : `Out: ${text[0]!.toLowerCase()}${text.slice(1)}`;
}

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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One scoreboard line; Last Afloat adds the crew's lives left (or "out"). */
export function resultLine(row: ScoreRow, lastAfloat?: { livesLeft: number; out: boolean }): string {
  const sinkings = plural(row.sinkings, "sinking", "sinkings");
  const lives = lastAfloat ? `${lastAfloat.out ? "out" : `${plural(lastAfloat.livesLeft, "life", "lives")} left`} · ` : "";
  return `${row.label}: ${lives}${sinkings} (${row.names})`;
}

/** While protected, the ship blinks `hz` times a second; `protection` counts down. */
export function blinkVisible(protection: number, hz: number): boolean {
  if (protection <= 0) return true;
  return Math.floor((TUNING.respawn.protection - protection) * hz * 2 + 1e-9) % 2 === 0;
}

/** A pack on the sea blinks in its last seconds before it disappears; `lifeLeft` counts down. */
export function packBlinkVisible(lifeLeft: number): boolean {
  const { packBlinkTime, packBlinkHz } = TUNING.client;
  if (lifeLeft > packBlinkTime) return true;
  return Math.floor((packBlinkTime - lifeLeft) * packBlinkHz * 2 + 1e-9) % 2 === 0;
}

/** "Paused by Sam"; non-hosts also learn that only the host resumes. */
export function pausedText(pausedBy: string, isHost: boolean): string {
  const who = pausedBy ? `Paused by ${pausedBy}` : "Paused";
  return isHost ? who : `${who} · Waiting for the host to resume`;
}
