import { describe, expect, it } from "vitest";
import { CREWS } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";

describe("crew styles", () => {
  // Stage 4 slice 4: chart-toned versions of the Stage 0 colours (approved 2026-10-29).
  it("gives each crew its own colour and symbol", () => {
    expect(CREW_STYLES).toHaveLength(CREWS.length);
    expect(CREW_STYLES[0]).toMatchObject({ colour: 0xc9782a, symbol: "●" });
    expect(CREW_STYLES[1]).toMatchObject({ colour: 0xb0407a, symbol: "■" });
    expect(CREW_STYLES[2]).toMatchObject({ name: "Crew 3", colour: 0x2a7f78, css: "#2A7F78", symbol: "▲" });
  });

  it("never repeats a colour or a symbol", () => {
    expect(new Set(CREW_STYLES.map((s) => s.colour)).size).toBe(CREW_STYLES.length);
    expect(new Set(CREW_STYLES.map((s) => s.symbol)).size).toBe(CREW_STYLES.length);
  });
});
