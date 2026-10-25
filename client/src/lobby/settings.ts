import { TUNING } from "@sink-or-sail/shared";

/** The host's lives dropdown: every whole number in the allowed range. */
export const LIFE_CHOICES: readonly number[] = Array.from(
  { length: TUNING.lastAfloat.maxLives - TUNING.lastAfloat.minLives + 1 },
  (_, i) => TUNING.lastAfloat.minLives + i,
);

/** The lives choice only matters for Last Afloat. */
export const livesShown = (mode: string) => mode === "lastAfloat";

/** What non-hosts see of the next match's mode (and lives). */
export const settingsText = (mode: string, lives: number) =>
  livesShown(mode) ? `Mode: Last Afloat · Lives: ${lives}` : "Mode: Sink Count";
