import { describe, expect, it } from "vitest";
import { GAME_NAME } from "./index.ts";

describe("shared", () => {
  it("exports the game name", () => {
    expect(GAME_NAME).toBe("Sink or Sail");
  });
});
