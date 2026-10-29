import { Phase, TUNING } from "@sink-or-sail/shared";

/** Stage 4 slice 1: the countdown beeps. */
export type BeepKind = "count" | "go" | "double" | "tick" | "high" | "horn";

type ClockView = { phase: string; countdown: number; timeLeft: number };

const EPS = 1e-6;
/** Seconds left at which the clock beeps: the double beep at 1:00, then every second over the last 10. */
const CLOCK_BEEPS: readonly [number, BeepKind][] = [
  [60, "double"],
  ...[10, 9, 8, 7, 6, 5, 4].map((s): [number, BeepKind] => [s, "tick"]),
  ...[3, 2, 1].map((s): [number, BeepKind] => [s, "high"]),
  [0, "horn"],
];

/**
 * Works out the beeps due from the match clock the server sends, one update at a time: 3, 2, 1 and Go! for the
 * start and resume countdowns, and the clock beeps as the time left passes each mark. Each device does this on its
 * own; a jump in the clock (a reconnect, a late update) plays none of the beeps it skipped.
 */
export class BeepClock {
  private last: ClockView | null = null;

  update(view: ClockView): BeepKind[] {
    const prev = this.last;
    this.last = { ...view };
    if (view.phase === Phase.Countdown) {
      const n = Math.max(1, Math.ceil(view.countdown));
      const changed = prev?.phase !== Phase.Countdown || Math.max(1, Math.ceil(prev.countdown)) !== n;
      return changed ? ["count"] : [];
    }
    if (!prev) return [];
    if (prev.phase === Phase.Countdown && view.phase === Phase.Running) return ["go"];
    // The clock only runs in a running match; an early end leaves time on it, so no horn.
    if (prev.phase !== Phase.Running || (view.phase !== Phase.Running && view.phase !== Phase.Over)) return [];
    if (prev.timeLeft - view.timeLeft > TUNING.client.sound.maxGap) return [];
    return CLOCK_BEEPS.filter(([s]) => prev.timeLeft > s + EPS && view.timeLeft <= s + EPS).map(([, kind]) => kind);
  }
}
