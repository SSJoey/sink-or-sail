import { describe, expect, it } from "vitest";
import { empText, formatClock, packSlotText } from "./hud.ts";

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

describe("packSlotText", () => {
  it("names the loaded pack, or shows an empty slot", () => {
    expect(packSlotText("torpedo")).toBe("Pack: Torpedo");
    expect(packSlotText("emp")).toBe("Pack: EMP");
    expect(packSlotText(null)).toBe("Pack: —");
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
