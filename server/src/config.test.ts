import { describe, expect, it } from "vitest";
import { GAME_NAME } from "@sink-or-sail/shared";
import { DEFAULT_PORT, resolvePort } from "./config.ts";

describe("server config", () => {
  it("can import from the shared package", () => {
    expect(GAME_NAME).toBe("Sink or Sail");
  });

  it("uses port 2567 when PORT is not set or invalid", () => {
    expect(DEFAULT_PORT).toBe(2567);
    expect(resolvePort({})).toBe(2567);
    expect(resolvePort({ PORT: "abc" })).toBe(2567);
  });

  it("uses PORT when it is set", () => {
    expect(resolvePort({ PORT: "3000" })).toBe(3000);
  });
});
