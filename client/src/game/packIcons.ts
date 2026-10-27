import type { PackType } from "@sink-or-sail/shared";

/**
 * Stage 3: each pack's icon (white on transparent, 24 × 24), used on the sea, in the top bar and on the Pack button.
 * Plain files in client/public, not imported: Vite would inline small SVGs as data URLs, which Phaser can't load.
 */
export const PACK_ICONS: Record<PackType, string> = {
  mine: "/icons/packs/mine.svg",
  torpedo: "/icons/packs/torpedo.svg",
  emp: "/icons/packs/emp.svg",
  health: "/icons/packs/health.svg",
};
