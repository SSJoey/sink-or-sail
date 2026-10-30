import { describe, expect, it } from "vitest";
import { empText, formatClock, livesHtml, ownLivesHtml, ownScoreHtml, packSlotLabel, scoreHtml, topBarScore } from "./hud.ts";

describe("formatClock", () => {
  it("shows minutes and seconds, rounding up so 0:00 means time is up", () => {
    expect(formatClock(240)).toBe("4:00");
    expect(formatClock(239.2)).toBe("4:00");
    expect(formatClock(61)).toBe("1:01");
    expect(formatClock(9.5)).toBe("0:10");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("packSlotLabel (Stage 3 pack icons: the top bar's spoken and hover text)", () => {
  it("names both slots, the pilot's first, with — for an empty one", () => {
    expect(packSlotLabel("mine", "torpedo")).toBe("Packs: Mine · Torpedo");
    expect(packSlotLabel(null, "emp")).toBe("Packs: — · EMP");
    expect(packSlotLabel("mine", null)).toBe("Packs: Mine · —");
    expect(packSlotLabel(null, null)).toBe("Packs: — · —");
  });
});

describe("scoreHtml", () => {
  it("shows each crew's symbol and sinkings in its colour, for 2 or 3 crews", () => {
    expect(scoreHtml([2, 1])).toBe('<span style="color:#C9782A">● 2</span> – <span style="color:#B0407A">■ 1</span>');
    expect(scoreHtml([0, 3, 1])).toBe('<span style="color:#C9782A">● 0</span> – <span style="color:#B0407A">■ 3</span> – <span style="color:#2A7F78">▲ 1</span>');
  });
});

describe("empText", () => {
  it("counts down whole seconds while the crew's ship is disabled", () => {
    expect(empText(3)).toBe("EMP 3");
    expect(empText(2.1)).toBe("EMP 3");
    expect(empText(0.2)).toBe("EMP 1");
    expect(empText(0)).toBe("");
  });
});

describe("livesHtml (Stage 2, Last Afloat)", () => {
  it("shows each crew's symbol and a heart per life left, or out, in its colour", () => {
    expect(livesHtml([{ livesLeft: 2, out: false }, { livesLeft: 1, out: false }])).toBe(
      '<span style="color:#C9782A">● ♥♥</span> – <span style="color:#B0407A">■ ♥</span>',
    );
    expect(livesHtml([{ livesLeft: 5, out: false }, { livesLeft: 0, out: true }, { livesLeft: 1, out: false }])).toBe(
      '<span style="color:#C9782A">● ♥♥♥♥♥</span> – <span style="color:#B0407A">■ out</span> – <span style="color:#2A7F78">▲ ♥</span>',
    );
  });
});

describe("the top bar's score with more than 3 crews (Stage 5)", () => {
  it("Sink Count: your crew's symbol and sinkings, and your place (ties share it)", () => {
    expect(ownScoreHtml([1, 3, 0, 2, 0], 3)).toBe('<span style="color:#2F5D9E">◆ 2</span> · 2nd of 5');
    expect(ownScoreHtml([1, 3, 0, 3, 0], 3)).toBe('<span style="color:#2F5D9E">◆ 3</span> · 1st of 5');
    expect(ownScoreHtml([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 9)).toBe('<span style="color:#5A6670">⬢ 0</span> · 1st of 10');
  });

  it("Last Afloat: your crew's hearts (or out), and how many ships are still afloat", () => {
    const ships = [{ livesLeft: 2, out: false }, { livesLeft: 0, out: true }, { livesLeft: 1, out: false }, { livesLeft: 3, out: false }];
    expect(ownLivesHtml(ships, 0)).toBe('<span style="color:#C9782A">● ♥♥</span> · 3 afloat');
    expect(ownLivesHtml(ships, 1)).toBe('<span style="color:#B0407A">■ out</span> · 3 afloat');
  });

  it("2–3 crews, or watching, keep today's line of every crew", () => {
    expect(topBarScore({ sinkings: [1, 2, 0], lastAfloat: false, ships: [], crew: 0 })).toBe(scoreHtml([1, 2, 0]));
    expect(topBarScore({ sinkings: [1, 2, 0, 1], lastAfloat: false, ships: [], crew: null })).toBe(scoreHtml([1, 2, 0, 1]));
    expect(topBarScore({ sinkings: [1, 2, 0, 1], lastAfloat: false, ships: [], crew: 2 })).toBe(ownScoreHtml([1, 2, 0, 1], 2));
    const ships = [0, 1, 2, 3].map(() => ({ livesLeft: 2, out: false }));
    expect(topBarScore({ sinkings: [0, 0, 0, 0], lastAfloat: true, ships, crew: 1 })).toBe(ownLivesHtml(ships, 1));
    expect(topBarScore({ sinkings: [0, 0, 0, 0], lastAfloat: true, ships, crew: null })).toBe(livesHtml(ships));
  });
});
