import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { BOT_SHIP_CHOICES, LAYOUT_CHOICES, LIFE_CHOICES, REEF_CHOICES, botShipsText, hazardsText, layoutText, livesShown, settingsText } from "./settings.ts";

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

describe("layout setting (Stage 2)", () => {
  it("offers the nine layouts by name, then Random", () => {
    expect(LAYOUT_CHOICES.map((c) => c.label)).toEqual(["One Island", "Twin Isles", "The Strait", "Four Rocks", "Crossroads", "The Wall", "The Ring", "Archipelago", "Slalom", "Random"]);
    expect(LAYOUT_CHOICES.at(-1)!.value).toBe("random");
    expect(LAYOUT_CHOICES[0]!.value).toBe("oneIsland");
  });

  it("names the layout; with Random, also the one in use once a match has picked it", () => {
    expect(layoutText("slalom", null)).toBe("Layout: Slalom");
    expect(layoutText("random", null)).toBe("Layout: Random");
    expect(layoutText("random", "wall")).toBe("Layout: Random → The Wall");
    expect(layoutText("slalom", "slalom")).toBe("Layout: Slalom");
    expect(layoutText("nonsense", null)).toBe("Layout: One Island");
  });
});

describe("hazards and reefs (Stage 2 slice 3)", () => {
  it("offers None, Few and All", () => {
    expect(REEF_CHOICES).toEqual([{ value: "none", label: "None" }, { value: "few", label: "Few" }, { value: "all", label: "All" }]);
  });

  it("tells non-hosts the hazards and reefs settings", () => {
    expect(hazardsText(true, "all")).toBe("Hazards: on · Reefs: All");
    expect(hazardsText(true, "few")).toBe("Hazards: on · Reefs: Few");
    expect(hazardsText(false, "all")).toBe("Hazards: off");
  });
});

describe("bot ships (Stage 3 slice 10)", () => {
  it("offers 0, 1 or 2, and says how many fit when fewer do", () => {
    expect(BOT_SHIP_CHOICES).toEqual([0, 1, 2]);
    expect(botShipsText(0, 0)).toBe("Bot ships: none");
    expect(botShipsText(1, 1)).toBe("Bot ships: 1");
    expect(botShipsText(2, 1)).toBe("Bot ships: 2 (1 fits)");
    expect(botShipsText(2, 0)).toBe("Bot ships: 2 (none fit)");
  });
});
