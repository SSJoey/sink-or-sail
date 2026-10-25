import { describe, expect, it } from "vitest";
import { PACK_LABELS, PACK_LETTERS, PACK_USER, packButtonLit, rolePack } from "./packRules.ts";

describe("pack rules", () => {
  it("knows who uses each pack: pilot drops mines, gunner fires torpedoes and EMPs, health is used on pickup", () => {
    expect(PACK_USER).toEqual({ mine: "pilot", torpedo: "gunner", emp: "gunner", health: null });
  });

  it("names each pack for the slot and the Pack button", () => {
    expect(PACK_LABELS).toEqual({ mine: "Mine", torpedo: "Torpedo", emp: "EMP", health: "Health" });
  });

  it("gives each pack its letter (for the top bar and the packs on the sea)", () => {
    expect(PACK_LETTERS).toEqual({ mine: "M", torpedo: "T", emp: "E", health: "H" });
  });

  it("finds each role's own slot", () => {
    const ship = { pilotPack: "mine" as const, gunnerPack: "torpedo" as const };
    expect(rolePack(ship, "pilot")).toBe("mine");
    expect(rolePack(ship, "gunner")).toBe("torpedo");
    expect(rolePack({ pilotPack: null, gunnerPack: null }, "gunner")).toBeNull();
  });

  it("lights the pilot's Pack button for a mine, never the gunner's", () => {
    expect(packButtonLit("mine", "pilot")).toBe(true);
    expect(packButtonLit("mine", "gunner")).toBe(false);
  });

  it("lights the gunner's Pack button for a torpedo, never the pilot's", () => {
    expect(packButtonLit("torpedo", "gunner")).toBe(true);
    expect(packButtonLit("torpedo", "pilot")).toBe(false);
  });

  it("lights the gunner's Pack button for an EMP, never the pilot's", () => {
    expect(packButtonLit("emp", "gunner")).toBe(true);
    expect(packButtonLit("emp", "pilot")).toBe(false);
  });

  it("keeps the button dim for an empty slot", () => {
    expect(packButtonLit(null, "pilot")).toBe(false);
    expect(packButtonLit(null, "gunner")).toBe(false);
  });
});
