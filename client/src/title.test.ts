import { describe, expect, it } from "vitest";
import { pageTitle } from "./title.ts";

describe("client", () => {
  it("takes its title from the shared package", () => {
    expect(pageTitle()).toBe("Sink or Sail");
  });
});
