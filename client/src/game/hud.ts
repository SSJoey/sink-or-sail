import { PACK_LABELS, type PackType } from "@sink-or-sail/shared";

/** Time left as m:ss, rounded up so the clock reads 0:00 only when time is up. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The pack slot in the top bar. */
export const packSlotText = (held: PackType | null) => `Pack: ${held ? PACK_LABELS[held] : "—"}`;

/** "EMP 3…2…1" in the top bar while the crew's ship is disabled. */
export const empText = (disabled: number) => (disabled > 0 ? `EMP ${Math.ceil(disabled)}` : "");
