import { PACK_LETTERS, type PackType } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";

/** Time left as m:ss, rounded up so the clock reads 0:00 only when time is up. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Both pack slots in the top bar, by letter: the pilot's first, then the gunner's. */
export const packSlotText = (pilotPack: PackType | null, gunnerPack: PackType | null) =>
  `Packs: ${pilotPack ? PACK_LETTERS[pilotPack] : "—"} · ${gunnerPack ? PACK_LETTERS[gunnerPack] : "—"}`;

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

/** "EMP 3…2…1" in the top bar while the crew's ship is disabled. */
export const empText = (disabled: number) => (disabled > 0 ? `EMP ${Math.ceil(disabled)}` : "");
