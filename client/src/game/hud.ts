import { PACK_LETTERS, type PackType } from "@sink-or-sail/shared";

/** Time left as m:ss, rounded up so the clock reads 0:00 only when time is up. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Both pack slots in the top bar, by letter: the pilot's first, then the gunner's. */
export const packSlotText = (pilotPack: PackType | null, gunnerPack: PackType | null) =>
  `Packs: ${pilotPack ? PACK_LETTERS[pilotPack] : "—"} · ${gunnerPack ? PACK_LETTERS[gunnerPack] : "—"}`;

/** "EMP 3…2…1" in the top bar while the crew's ship is disabled. */
export const empText = (disabled: number) => (disabled > 0 ? `EMP ${Math.ceil(disabled)}` : "");
