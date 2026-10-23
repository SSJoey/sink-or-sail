import { describe, expect, it } from "vitest";
import { CREWS } from "@sink-or-sail/shared";
import { CREW_STYLES } from "./crews.ts";

describe("crew styles", () => {
  it("gives each crew its own colour and symbol", () => {
    expect(CREW_STYLES).toHaveLength(CREWS.length);
    expect(CREW_STYLES[0]).toMatchObject({ colour: 0xf5a623, symbol: "●" });
    expect(CREW_STYLES[1]).toMatchObject({ colour: 0xe8559a, symbol: "■" });
  });
});
