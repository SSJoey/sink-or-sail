import { PACK_LABELS, SHIP_TYPE_NAMES, isShipType, type PackType } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";
import { crewNames, type LabelPlayer } from "./labels.ts";

/** Time left as m:ss, rounded up so the clock reads 0:00 only when time is up. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Both pack slots in the top bar, by name (its spoken and hover text; the icons show them): the pilot's first. */
export const packSlotLabel = (pilotPack: PackType | null, gunnerPack: PackType | null) =>
  `Packs: ${pilotPack ? PACK_LABELS[pilotPack] : "—"} · ${gunnerPack ? PACK_LABELS[gunnerPack] : "—"}`;

/** The score in the top bar: each crew's symbol and sinkings, in its colour. */
export function scoreHtml(sinkings: readonly number[]): string {
  return sinkings
    .map((count, i) => {
      const style = CREW_STYLES[i] ?? CREW_STYLES[0];
      return `<span style="color:${style.css}">${style.symbol} ${count}</span>`;
    })
    .join(" – ");
}

/** Last Afloat's score in the top bar: each crew's symbol and a heart per life left, or "out", in its colour. */
export function livesHtml(ships: readonly { livesLeft: number; out: boolean }[]): string {
  return ships
    .map((ship, i) => {
      const style = CREW_STYLES[i] ?? CREW_STYLES[0];
      return `<span style="color:${style.css}">${style.symbol} ${ship.out ? "out" : "♥".repeat(Math.max(0, ship.livesLeft))}</span>`;
    })
    .join(" – ");
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const crewTag = (crew: number, text: string) => {
  const style = CREW_STYLES[crew] ?? CREW_STYLES[0];
  return `<span style="color:${style.css}">${style.symbol} ${text}</span>`;
};

/** Stage 5, more than 3 crews: your crew's sinkings and place ("◆ 2 · 2nd of 5"); crews level share a place. */
export function ownScoreHtml(sinkings: readonly number[], crew: number): string {
  const mine = sinkings[crew] ?? 0;
  const place = 1 + sinkings.filter((n) => n > mine).length;
  return `${crewTag(crew, String(mine))} · ${ordinal(place)} of ${sinkings.length}`;
}

/** Stage 5, more than 3 crews in Last Afloat: your crew's hearts (or "out") and how many ships are still afloat. */
export function ownLivesHtml(ships: readonly { livesLeft: number; out: boolean }[], crew: number): string {
  const own = ships[crew];
  const afloat = ships.filter((s) => !s.out).length;
  return `${crewTag(crew, !own || own.out ? "out" : "♥".repeat(Math.max(0, own.livesLeft)))} · ${afloat} afloat`;
}

/** Stage 5 slice 7: how many ships are still in a Last Afloat match ("7 of 10 afloat"), for a spectator's top bar. */
export const afloatText = (ships: readonly { out: boolean }[]) => `${ships.filter((s) => !s.out).length} of ${ships.length} afloat`;

/**
 * The top bar's score: every crew with 2–3 crews; otherwise your own crew's (Stage 5). Watching more than 3 crews,
 * the scores are in the scoreboard panel: nothing here in Sink Count, the ships afloat in Last Afloat (slice 7).
 */
export function topBarScore(s: { sinkings: readonly number[]; lastAfloat: boolean; ships: readonly { livesLeft: number; out: boolean }[]; crew: number | null }): string {
  const many = s.sinkings.length > 3;
  if (many && s.crew === null) return s.lastAfloat ? afloatText(s.ships) : "";
  if (s.lastAfloat) return many ? ownLivesHtml(s.ships, s.crew!) : livesHtml(s.ships);
  return many ? ownScoreHtml(s.sinkings, s.crew!) : scoreHtml(s.sinkings);
}

/** Stage 5 slice 7: the scoreboard panel shows to someone watching (no seat), with more than 3 crews. */
export const standingsShown = (crew: number | null, crews: number) => crew === null && crews > 3;

export interface StandingsRow {
  crew: number;
  place: string;
  symbol: string;
  css: string;
  name: string;
  players: string;
  ship: string;
  score: string;
}

/**
 * Stage 5 slice 7: the spectator's scoreboard, one row per crew by place: Sink Count by sinkings, Last Afloat by
 * lives left (a crew that is out last). Crews level share a place and keep crew order.
 */
export function standingsRows(
  ships: readonly { sinkings: number; livesLeft: number; out: boolean; type: string }[],
  players: readonly LabelPlayer[],
  lastAfloat: boolean,
): StandingsRow[] {
  const rank = (s: (typeof ships)[number]) => (lastAfloat ? (s.out ? -1 : s.livesLeft) : s.sinkings);
  return ships
    .map((s, crew) => {
      const style = CREW_STYLES[crew] ?? CREW_STYLES[0];
      const place = 1 + ships.filter((o) => rank(o) > rank(s)).length;
      const score = lastAfloat ? (s.out ? "out" : "♥".repeat(Math.max(0, s.livesLeft))) : String(s.sinkings);
      const ship = SHIP_TYPE_NAMES[isShipType(s.type) ? s.type : "frigate"];
      return { crew, rank: place, row: { crew, place: ordinal(place), symbol: style.symbol, css: style.css, name: style.name, players: crewNames(players, crew) || "—", ship, score } };
    })
    .sort((a, b) => a.rank - b.rank || a.crew - b.crew)
    .map((r) => r.row);
}

/** "EMP 3…2…1" in the top bar while the crew's ship is disabled. */
export const empText = (disabled: number) => (disabled > 0 ? `EMP ${Math.ceil(disabled)}` : "");
