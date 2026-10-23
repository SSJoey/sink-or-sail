import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchLog, fileSink, logFileName, memorySink } from "./matchLog.ts";

describe("logFileName", () => {
  it("uses local date, time and the room code", () => {
    expect(logFileName(new Date(2026, 9, 24, 18, 5, 9), "KWPZ")).toBe("2026-10-24_18-05-09_KWPZ.jsonl");
  });
});

describe("MatchLog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("buffers lines and writes nothing until it flushes", () => {
    const sink = memorySink();
    const log = new MatchLog(sink, { flushMs: 1000 });
    log.write({ t: 0, type: "a" });
    expect(sink.text()).toBe("");
    void log.close();
  });

  it("flushes on a timer as JSON Lines, in order", async () => {
    const sink = memorySink();
    const log = new MatchLog(sink, { flushMs: 1000 });
    log.write({ t: 0, type: "a" });
    log.write({ t: 5, type: "b", n: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(sink.text()).toBe('{"t":0,"type":"a"}\n{"t":5,"type":"b","n":1}\n');
    log.write({ t: 9, type: "c" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(sink.text().split("\n").filter(Boolean)).toHaveLength(3);
    await log.close();
  });

  it("flushes everything on close and ignores writes after it", async () => {
    const sink = memorySink();
    const log = new MatchLog(sink, { flushMs: 60_000 });
    log.write({ t: 0, type: "a" });
    await log.close();
    expect(sink.text()).toBe('{"t":0,"type":"a"}\n');
    log.write({ t: 1, type: "late" });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sink.text()).toBe('{"t":0,"type":"a"}\n');
  });

  it("reports a failed write, keeps the game going and keeps logging", async () => {
    let fail = true;
    const written: string[] = [];
    const onError = vi.fn();
    const log = new MatchLog(
      { append: async (text) => { if (fail) throw new Error("disk full"); written.push(text); } },
      { flushMs: 1000, onError },
    );
    log.write({ t: 0, type: "a" });
    expect(() => log.write({ t: 1, type: "b" })).not.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledOnce();
    fail = false;
    log.write({ t: 2, type: "c" });
    await log.close();
    expect(written.join("")).toBe('{"t":2,"type":"c"}\n');
  });
});

describe("fileSink", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "sos-log-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("appends to a file, creating its folder", async () => {
    const path = join(dir, "nested", "m.jsonl");
    const sink = fileSink(path);
    await sink.append("one\n");
    await sink.append("two\n");
    expect(await readFile(path, "utf8")).toBe("one\ntwo\n");
  });
});
