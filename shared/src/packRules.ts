import type { Role } from "./rooms.ts";
import type { PackType } from "./sim/types.ts";

/** Which role uses each pack (health is used on pickup, by nobody). */
export const PACK_USER: Record<PackType, Role | null> = { mine: "pilot", torpedo: "gunner", emp: "gunner", health: null };

export const PACK_LABELS: Record<PackType, string> = { mine: "Mine", torpedo: "Torpedo", emp: "EMP", health: "Health" };

/** Each pack's letter (shown on the sea and in the top bar until Stage 3's pack icons replaced them). */
export const PACK_LETTERS: Record<PackType, string> = { mine: "M", torpedo: "T", emp: "E", health: "H" };

/** The pack in a role's own slot: the pilot's (a mine) or the gunner's (a torpedo or EMP). */
export const rolePack = (ship: { pilotPack: PackType | null; gunnerPack: PackType | null }, role: Role): PackType | null =>
  role === "pilot" ? ship.pilotPack : ship.gunnerPack;

/** Packs that can be used (health is used on pickup, by nobody). */
export const USABLE_PACKS: ReadonlySet<PackType> = new Set<PackType>(["mine", "torpedo", "emp"]);

/** The Pack button is lit only for the role that can use what's loaded. */
export function packButtonLit(held: PackType | null, role: Role): boolean {
  return held !== null && USABLE_PACKS.has(held) && PACK_USER[held] === role;
}
