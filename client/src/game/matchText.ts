import { AWARD_NAMES, Phase, TUNING } from "@sink-or-sail/shared";
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
  if (cause === "storm") return "Lost to the storm";
  if (cause === "kraken") return "Taken by the kraken";
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

/**
 * Stage 2 closing storm, the line at the top of the sea: "Storm in 0:42" (whole seconds, rounded up), then
 * "Storm closing", then "Storm closed"; "In the storm!" while the crew's ship is outside the circle.
 */
export function stormText(elapsed: number, times: { startsAt: number; closedAt: number }, ownInStorm: boolean): string {
  if (ownInStorm) return "In the storm!";
  if (elapsed < times.startsAt) {
    const left = Math.ceil(times.startsAt - elapsed - 1e-9);
    return `Storm in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  }
  return elapsed < times.closedAt ? "Storm closing" : "Storm closed";
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

/** Stage 2: the ghost crew's top bar: how haunted its ghost's zone is, in five blocks. */
export function hauntingText(meter: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(meter * 5)));
  return `Haunting ${"▮".repeat(filled)}${"▯".repeat(5 - filled)}`;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;

/**
 * Stage 3: the results table's rows, by place: place, crew (symbol, name and players, pilot first; a bot ship as "(bots)"), sinkings and
 * time afloat; Last Afloat adds lives left (or "out").
 */
export function resultRows(
  results: readonly { ship: number; place: number; sinkings: number; afloatSeconds: number; livesLeft: number; out: boolean }[],
  players: readonly { name: string; crew?: number; role?: string; bot?: boolean }[],
  lastAfloat: boolean,
): string[][] {
  return [...results]
    .sort((a, b) => a.place - b.place || a.ship - b.ship)
    .map((r) => {
      const crew = players.filter((p) => p.crew === r.ship);
      const names = crew
        .sort((a, b) => (a.role === "pilot" ? -1 : b.role === "pilot" ? 1 : 0))
        .map((p) => p.name)
        .join(" & ") || "—";
      // Slice 10: a bot ship shows as the crew's bots.
      const bots = crew.length > 0 && crew.every((p) => p.bot === true);
      return [ordinal(r.place), bots ? `${crewLabel(r.ship)} (bots)` : `${crewLabel(r.ship)} · ${names}`, String(r.sinkings), minutes(r.afloatSeconds), ...(lastAfloat ? [r.out ? "out" : String(r.livesLeft)] : [])];
    });
}

/** Stage 3: the results close by themselves; whole seconds left, rounded up. */
export const backToLobbyText = (secondsLeft: number) => `Back to the lobby in ${Math.max(0, Math.ceil(secondsLeft))}`;

/** Stage 3: each award shown at the end: its name, the crew that earned it, and what earned it. */
export function awardLines(awards: readonly { award: string; ship: number; detail: string }[]) {
  return awards.map((a) => ({ name: AWARD_NAMES[a.award] ?? a.award, crew: crewLabel(a.ship), detail: a.detail }));
}

/** Stage 3: the top bar's first words for a spectator (or anyone without a seat): watching, and the mode. */
export const watchingLabel = (mode: string) => `Watching · ${mode === "lastAfloat" ? "Last Afloat" : "Sink Count"}`;
