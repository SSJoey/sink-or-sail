import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CREWS,
  MAX_PLAYERS,
  NAME_MAX_LENGTH,
  RECONNECT_WINDOW_SECONDS,
  isSeat,
  normaliseCode,
  normaliseName,
  shipTypePicker,
} from "./rooms.ts";

describe("room constants", () => {
  it("uses 4-letter codes from A–Z without I and O", () => {
    expect(CODE_LENGTH).toBe(4);
    expect(CODE_ALPHABET).toBe("ABCDEFGHJKLMNPQRSTUVWXYZ");
    expect(CODE_ALPHABET).toHaveLength(24);
  });

  it("allows 20 players (10 crews, Stage 5), 12-character names and a 60 s reconnection window", () => {
    expect(MAX_PLAYERS).toBe(20);
    expect(CREWS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(NAME_MAX_LENGTH).toBe(12);
    expect(RECONNECT_WINDOW_SECONDS).toBe(60);
  });
});

describe("normaliseCode", () => {
  it("accepts lowercase and surrounding or inner spaces", () => {
    expect(normaliseCode("kwpz")).toBe("KWPZ");
    expect(normaliseCode("  k w p z ")).toBe("KWPZ");
  });

  it("rejects codes of the wrong length", () => {
    expect(normaliseCode("KWP")).toBeNull();
    expect(normaliseCode("KWPZA")).toBeNull();
    expect(normaliseCode("")).toBeNull();
  });

  it("rejects characters outside the alphabet", () => {
    expect(normaliseCode("KWPI")).toBeNull();
    expect(normaliseCode("KWPO")).toBeNull();
    expect(normaliseCode("KWP1")).toBeNull();
    expect(normaliseCode("KW-Z")).toBeNull();
  });

  it("rejects anything that is not a string", () => {
    expect(normaliseCode(undefined)).toBeNull();
    expect(normaliseCode(1234)).toBeNull();
  });
});

describe("normaliseName", () => {
  it("trims spaces", () => {
    expect(normaliseName("  Sam  ")).toBe("Sam");
  });

  it("accepts 1 to 12 characters", () => {
    expect(normaliseName("A")).toBe("A");
    expect(normaliseName("Abcdefghijkl")).toBe("Abcdefghijkl");
  });

  it("rejects empty, blank and too-long names", () => {
    expect(normaliseName("")).toBeNull();
    expect(normaliseName("   ")).toBeNull();
    expect(normaliseName("Abcdefghijklm")).toBeNull();
  });

  it("counts characters, not UTF-16 units, so emoji names fit", () => {
    expect(normaliseName("🚢".repeat(12))).toBe("🚢".repeat(12));
    expect(normaliseName("🚢".repeat(13))).toBeNull();
  });

  it("rejects anything that is not a string", () => {
    expect(normaliseName(undefined)).toBeNull();
    expect(normaliseName({ name: "Sam" })).toBeNull();
  });
});

describe("isSeat", () => {
  it("accepts crew 0, 1 or 2 with role pilot or gunner", () => {
    expect(isSeat({ crew: 0, role: "pilot" })).toBe(true);
    expect(isSeat({ crew: 1, role: "gunner" })).toBe(true);
    expect(isSeat({ crew: 2, role: "pilot" })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isSeat({ crew: 9, role: "pilot" })).toBe(true);
    expect(isSeat({ crew: 10, role: "pilot" })).toBe(false);
    expect(isSeat({ crew: -1, role: "pilot" })).toBe(false);
    expect(isSeat({ crew: "0", role: "pilot" })).toBe(false);
    expect(isSeat({ crew: 0, role: "captain" })).toBe(false);
    expect(isSeat({ crew: 0 })).toBe(false);
    expect(isSeat(null)).toBe(false);
    expect(isSeat("pilot")).toBe(false);
  });
});

describe("shipTypePicker (Stage 5)", () => {
  const person = { bot: false };
  const bot = { bot: true };
  it("is the pilot, or the gunner when the pilot is a bot or the seat is empty; nobody for a crew of bots", () => {
    expect(shipTypePicker(person, person)).toBe("pilot");
    expect(shipTypePicker(person, undefined)).toBe("pilot");
    expect(shipTypePicker(person, bot)).toBe("pilot");
    expect(shipTypePicker(bot, person)).toBe("gunner");
    expect(shipTypePicker(undefined, person)).toBe("gunner");
    expect(shipTypePicker(bot, bot)).toBeNull();
    expect(shipTypePicker(undefined, undefined)).toBeNull();
  });
});
