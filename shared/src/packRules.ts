import type { Role } from "./rooms.ts";
import type { PackType } from "./sim/types.ts";

/** Which role uses each pack (health is used on pickup, by nobody). */
export const PACK_USER: Record<PackType, Role | null> = { mine: "pilot", torpedo: "gunner", emp: "gunner", health: null };

export const PACK_LABELS: Record<PackType, string> = { mine: "Mine", torpedo: "Torpedo", emp: "EMP", health: "Health" };

/** Packs that can be used (health is used on pickup, by nobody). */
export const USABLE_PACKS: ReadonlySet<PackType> = new Set<PackType>(["mine", "torpedo", "emp"]);

/** The Pack button is lit only for the role that can use what's loaded. */
export function packButtonLit(held: PackType | null, role: Role): boolean {
  return held !== null && USABLE_PACKS.has(held) && PACK_USER[held] === role;
}
