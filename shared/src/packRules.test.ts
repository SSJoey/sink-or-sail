import { describe, expect, it } from "vitest";
import { PACK_LABELS, PACK_USER, packButtonLit } from "./packRules.ts";

describe("pack rules", () => {
  it("knows who uses each pack: pilot drops mines, gunner fires torpedoes and EMPs, health is used on pickup", () => {
    expect(PACK_USER).toEqual({ mine: "pilot", torpedo: "gunner", emp: "gunner", health: null });
  });

  it("names each pack for the slot and the Pack button", () => {
    expect(PACK_LABELS).toEqual({ mine: "Mine", torpedo: "Torpedo", emp: "EMP", health: "Health" });
  });

  it("keeps every Pack button dim in slice 1: nothing is usable yet", () => {
    for (const pack of ["mine", "torpedo", "emp"] as const) {
      expect(packButtonLit(pack, "pilot")).toBe(false);
      expect(packButtonLit(pack, "gunner")).toBe(false);
    }
    expect(packButtonLit(null, "pilot")).toBe(false);
  });
});
