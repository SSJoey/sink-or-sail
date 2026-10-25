import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { LIFE_CHOICES, livesShown, settingsText } from "./settings.ts";

describe("room-screen match settings (Stage 2)", () => {
  it("tells non-hosts the mode, and the lives with Last Afloat", () => {
    expect(settingsText("sinkCount", 2)).toBe("Mode: Sink Count");
    expect(settingsText("lastAfloat", 2)).toBe("Mode: Last Afloat · Lives: 2");
  });

  it("shows the lives choice only with Last Afloat", () => {
    expect(livesShown("lastAfloat")).toBe(true);
    expect(livesShown("sinkCount")).toBe(false);
  });

  it(`offers ${TUNING.lastAfloat.minLives} to ${TUNING.lastAfloat.maxLives} lives`, () => {
    expect(LIFE_CHOICES).toEqual([1, 2, 3, 4, 5]);
  });
});
