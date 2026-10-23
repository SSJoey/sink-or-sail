import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Where log text goes: a file in production, memory in tests. */
export interface LogSink {
  append(text: string): Promise<void>;
}

export function fileSink(path: string): LogSink {
  let ready: Promise<unknown> | null = null;
  return {
    async append(text) {
      ready ??= mkdir(dirname(path), { recursive: true });
      await ready;
      await appendFile(path, text, "utf8");
    },
  };
}

export function memorySink(): LogSink & { text(): string } {
  let all = "";
  return {
    async append(text) { all += text; },
    text: () => all,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** e.g. "2026-10-24_18-05-09_KWPZ.jsonl", in local time. */
export function logFileName(date: Date, room: string): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `${day}_${time}_${room}.jsonl`;
}

export interface MatchLogOptions {
  flushMs?: number;
  onError?: (error: unknown) => void;
}

/**
 * A match's event log as JSON Lines. `write` only adds to a memory buffer, so it never slows
 * the simulation; the buffer is written out asynchronously on a timer and on close, one write at a time.
 * A failed write is reported through `onError` and the game carries on.
 */
export class MatchLog {
  private readonly sink: LogSink;
  private readonly onError: (error: unknown) => void;
  private buffer: string[] = [];
  private writing: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | null;
  private closed = false;

  constructor(sink: LogSink, options: MatchLogOptions = {}) {
    this.sink = sink;
    this.onError = options.onError ?? ((error) => console.error("Match log write failed:", error));
    this.timer = setInterval(() => void this.flush(), options.flushMs ?? 1000);
  }

  write(line: object): void {
    if (!this.closed) this.buffer.push(JSON.stringify(line));
  }

  flush(): Promise<void> {
    if (this.buffer.length === 0) return this.writing;
    const text = this.buffer.join("\n") + "\n";
    this.buffer = [];
    this.writing = this.writing.then(() => this.sink.append(text)).catch((error) => this.onError(error));
    return this.writing;
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.closed = true;
    await this.flush();
  }
}
