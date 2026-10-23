import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startInputSender } from "./inputSender.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("startInputSender", () => {
  it("sends the current input at a steady rate", () => {
    const sent: unknown[] = [];
    let n = 0;
    startInputSender(() => ({ n: n++ }), (m) => sent.push(m), 20);
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(20);
    expect(sent[0]).toEqual({ n: 0 });
  });

  it("skips a tick when there is nothing to send", () => {
    const sent: unknown[] = [];
    startInputSender(() => null, (m) => sent.push(m), 20);
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(0);
  });

  it("stops when told to", () => {
    const sent: unknown[] = [];
    const stop = startInputSender(() => ({}), (m) => sent.push(m), 20);
    vi.advanceTimersByTime(500);
    stop();
    vi.advanceTimersByTime(500);
    expect(sent).toHaveLength(10);
  });
});
