import { describe, expect, it } from "vitest";
import { PackLatch } from "./packLatch.ts";

describe("PackLatch", () => {
  it("remembers a quick press until the next send, even if released before it", () => {
    const latch = new PackLatch();
    latch.update(true);
    latch.update(false); // tapped and released between two sends
    expect(latch.take()).toBe(true);
    expect(latch.take()).toBe(false);
  });

  it("stays pressed while held", () => {
    const latch = new PackLatch();
    latch.update(true);
    expect(latch.take()).toBe(true);
    latch.update(true);
    expect(latch.take()).toBe(true);
  });

  it("is not pressed when nothing was pressed", () => {
    const latch = new PackLatch();
    latch.update(false);
    expect(latch.take()).toBe(false);
  });
});
