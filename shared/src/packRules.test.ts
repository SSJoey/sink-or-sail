import { describe, expect, it } from "vitest";
import { PACK_LABELS, PACK_USER, packButtonLit } from "./packRules.ts";

describe("pack rules", () => {
  it("knows who uses each pack: pilot drops mines, gunner fires torpedoes and EMPs, health is used on pickup", () => {
    expect(PACK_USER).toEqual({ mine: "pilot", torpedo: "gunner", emp: "gunner", health: null });
  });

  it("names each pack for the slot and the Pack button", () => {
    expect(PACK_LABELS).toEqual({ mine: "Mine", torpedo: "Torpedo", emp: "EMP", health: "Health" });
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
