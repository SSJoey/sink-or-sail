import { describe, expect, it } from "vitest";
import { formatClock } from "./hud.ts";

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
