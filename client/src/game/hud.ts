import { PACK_LABELS, type PackType } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";

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

/** The top bar's score: every crew with 2–3 crews or when watching; otherwise your own crew's (Stage 5). */
export function topBarScore(s: { sinkings: readonly number[]; lastAfloat: boolean; ships: readonly { livesLeft: number; out: boolean }[]; crew: number | null }): string {
  const own = s.crew !== null && s.sinkings.length > 3;
  if (s.lastAfloat) return own ? ownLivesHtml(s.ships, s.crew!) : livesHtml(s.ships);
  return own ? ownScoreHtml(s.sinkings, s.crew!) : scoreHtml(s.sinkings);
}

/** "EMP 3…2…1" in the top bar while the crew's ship is disabled. */
export const empText = (disabled: number) => (disabled > 0 ? `EMP ${Math.ceil(disabled)}` : "");
