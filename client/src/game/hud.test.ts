import { describe, expect, it } from "vitest";
import { empText, formatClock, livesHtml, packSlotLabel, scoreHtml } from "./hud.ts";

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
    expect(scoreHtml([2, 1])).toBe('<span style="color:#F5A623">● 2</span> – <span style="color:#E8559A">■ 1</span>');
    expect(scoreHtml([0, 3, 1])).toBe('<span style="color:#F5A623">● 0</span> – <span style="color:#E8559A">■ 3</span> – <span style="color:#2BB3C0">▲ 1</span>');
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
      '<span style="color:#F5A623">● ♥♥</span> – <span style="color:#E8559A">■ ♥</span>',
    );
    expect(livesHtml([{ livesLeft: 5, out: false }, { livesLeft: 0, out: true }, { livesLeft: 1, out: false }])).toBe(
      '<span style="color:#F5A623">● ♥♥♥♥♥</span> – <span style="color:#E8559A">■ out</span> – <span style="color:#2BB3C0">▲ ♥</span>',
    );
  });
});
