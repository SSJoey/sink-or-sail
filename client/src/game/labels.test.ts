import { describe, expect, it } from "vitest";
import { TUNING } from "@sink-or-sail/shared";
import { crewNames, ghostLabelShown, labelFontPx, shipLabel } from "./labels.ts";
import type { HazardView } from "./interpolation.ts";

const players = [
  { name: "Jon", crew: 2, role: "gunner", bot: false },
  { name: "Ana", crew: 2, role: "pilot", bot: false },
  { name: "Mia", crew: 0, role: "gunner", bot: false },
  { name: "Bot", crew: 0, role: "pilot", bot: true },
  { name: "Bot", crew: 4, role: "pilot", bot: true },
  { name: "Bot", crew: 4, role: "gunner", bot: true },
  { name: "Tom", role: undefined, bot: false },
];

describe("name labels (Stage 5 slice 7)", () => {
  it("names the crew, pilot first, joined by +", () => {
    expect(crewNames(players, 2)).toBe("Ana + Jon");
    // A partner bot is "Bot"; a crew of bots is a bot ship: "Bots".
    expect(crewNames(players, 0)).toBe("Bot + Mia");
    expect(crewNames(players, 4)).toBe("Bots");
    // A crew with only one player (its partner gone): just that name; nobody at all: nothing.
    expect(crewNames([{ name: "Ana", crew: 1, role: "gunner", bot: false }], 1)).toBe("Ana");
    expect(crewNames(players, 7)).toBe("");
  });

  it("is the crew symbol in its colour, then the names", () => {
    expect(shipLabel(players, 2)).toEqual({ symbol: "▲", colour: 0x2a7f78, text: "Ana + Jon" });
    expect(shipLabel(players, 4)).toEqual({ symbol: "✚", colour: 0x5e7f2a, text: "Bots" });
  });

  it("keeps a fixed size on screen: the game's own size, but never below a few screen pixels", () => {
    const L = TUNING.client.labels;
    // A laptop or TV showing the 1600-wide canvas at 1366 or 1920 px: the game's size.
    expect(labelFontPx(1600, 1920)).toBe(L.fontPx);
    expect(labelFontPx(1600, 1366)).toBe(L.fontPx);
    // A 667 px phone: bigger in the game, so at least minScreenPx on the phone.
    expect(labelFontPx(1600, 667)).toBeCloseTo((L.minScreenPx * 1600) / 667);
    expect(labelFontPx(1600, 0)).toBe(L.fontPx);
  });

  it("a ghost's label hides with the ghost in a moving storm, except from its own crew", () => {
    const storm = new Map<string, HazardView>([["1", { kind: "movingStorm", phase: "active", x: 500, y: 500 } as HazardView]]);
    const ghost = { x: 500, y: 500 };
    expect(ghostLabelShown(ghost, 3, null, new Map())).toBe(true);
    expect(ghostLabelShown(ghost, 3, null, storm)).toBe(false);
    expect(ghostLabelShown(ghost, 3, 3, storm)).toBe(true);
  });
});
