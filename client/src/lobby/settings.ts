import { DEFAULT_LAYOUT, LAYOUTS, LAYOUT_IDS, MAX_BOT_SHIPS, RANDOM_LAYOUT, TUNING, isLayoutId } from "@sink-or-sail/shared";

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

/** The host's layout dropdown: every layout by name, then Random. */
export const LAYOUT_CHOICES: readonly { value: string; label: string }[] = [
  ...LAYOUT_IDS.map((id) => ({ value: id, label: LAYOUTS[id].name })),
  { value: RANDOM_LAYOUT, label: "Random" },
];

const layoutName = (id: string) => LAYOUTS[isLayoutId(id) ? id : DEFAULT_LAYOUT].name;

/** "Layout: Slalom", or "Layout: Random", with the layout Random picked once a match has one (`inUse`). */
export function layoutText(setting: string, inUse: string | null): string {
  if (setting !== RANDOM_LAYOUT) return `Layout: ${layoutName(setting)}`;
  return inUse ? `Layout: Random → ${layoutName(inUse)}` : "Layout: Random";
}

/** Stage 3 slice 10: the host's Bot ships dropdown. */
export const BOT_SHIP_CHOICES: readonly number[] = Array.from({ length: MAX_BOT_SHIPS + 1 }, (_, i) => i);

/** "Bot ships: 2", or with fewer room for them than asked, "Bot ships: 2 (1 fits)". */
export function botShipsText(setting: number, fits: number): string {
  if (setting === 0) return "Bot ships: none";
  return fits >= setting ? `Bot ships: ${setting}` : `Bot ships: ${setting} (${fits === 0 ? "none fit" : `${fits} fits`})`;
}

/** The host's Reefs dropdown (used only with hazards on). */
export const REEF_CHOICES: readonly { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "few", label: "Few" },
  { value: "all", label: "All" },
];

/** What non-hosts see of the next match's hazards: "Hazards: on · Reefs: All", or "Hazards: off". */
export function hazardsText(on: boolean, reefs: string): string {
  if (!on) return "Hazards: off";
  return `Hazards: on · Reefs: ${REEF_CHOICES.find((c) => c.value === reefs)?.label ?? "All"}`;
}
