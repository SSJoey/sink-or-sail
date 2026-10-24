import { PACK_USER, USABLE_PACKS, type PackType, type Role } from "@sink-or-sail/shared";

/** The gunner's phone buzzes once when the crew picks up a pack the gunner fires (torpedo; EMP from slice 4). */
export function gunnerPackBuzz(before: PackType | null, now: PackType | null, role: Role): boolean {
  return role === "gunner" && now !== null && now !== before && PACK_USER[now] === "gunner" && USABLE_PACKS.has(now);
}
