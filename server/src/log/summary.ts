// Turns a match log (JSON Lines) into per-crew numbers for tuning and playtest notes.

export type Line = { t: number; type: string } & Record<string, unknown>;

export interface CrewSummary {
  ship: number;
  pilot: string | null;
  gunner: string | null;
  sinkings: number;
  shots: number;
  /** Shots that did damage. */
  hits: number;
  /** This crew's shots stopped by the other ship's shield (counted as misses). */
  blocked: number;
  /** hits ÷ shots; null if the crew never fired. */
  accuracy: number | null;
  boostEnergy: number;
  shieldEnergy: number;
  /** Seconds the shared bar sat empty (until it reached the restart threshold, or the ship respawned). */
  emptySeconds: number;
  /** Lives run from (re)spawn to sinking; the last life counts up to the match end. */
  averageSurvivalSeconds: number;
  lives: number;
}

export interface MatchSummary {
  room: string | null;
  durationSeconds: number;
  winner: number | null;
  endedEarly: boolean;
  /** False when the log has no matchEnd (e.g. everyone left mid-match). */
  complete: boolean;
  crews: CrewSummary[];
}

export function parseLog(text: string): Line[] {
  const lines: Line[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const line = JSON.parse(raw);
      if (typeof line?.t === "number" && typeof line?.type === "string") lines.push(line);
    } catch {
      // A line cut short by a crash; skip it.
    }
  }
  return lines;
}

type Crew = { ship: number; pilot: string | null; gunner: string | null };
type Score = { ship: number; sinkings: number; boostEnergy: number; shieldEnergy: number };

export function summarise(lines: readonly Line[]): MatchSummary {
  const start = lines.find((l) => l.type === "matchStart");
  const end = lines.find((l) => l.type === "matchEnd");
  const endT = end?.t ?? lines.at(-1)?.t ?? 0;
  const crews = (start?.crews as Crew[] | undefined) ?? [];
  const scores = end?.scores as Score[] | undefined;

  const summaries = crews.map((crew): CrewSummary => {
    const ship = crew.ship;
    const mine = (type: string, field = "ship") => lines.filter((l) => l.type === type && l[field] === ship);

    const shots = mine("shotFired").length;
    const hits = mine("hit").length;
    const blocked = mine("shotBlocked", "attacker").length;
    const score = scores?.find((s) => s.ship === ship);
    const lastPosition = mine("position").at(-1);

    // Empty-bar time and lives, walking this ship's events in order.
    let emptySince: number | null = null;
    let emptyMs = 0;
    let lifeStart: number | null = 0;
    const lifeLengths: number[] = [];
    for (const l of lines) {
      if (l.ship !== ship) continue;
      if (l.type === "energyEmpty" && emptySince === null) emptySince = l.t;
      if ((l.type === "energyRestored" || l.type === "respawn") && emptySince !== null) {
        emptyMs += l.t - emptySince;
        emptySince = null;
      }
      if (l.type === "sunk" && lifeStart !== null) {
        lifeLengths.push(l.t - lifeStart);
        lifeStart = null;
      }
      if (l.type === "respawn") lifeStart = l.t;
    }
    if (emptySince !== null) emptyMs += endT - emptySince;
    if (lifeStart !== null) lifeLengths.push(endT - lifeStart);

    return {
      ship,
      pilot: crew.pilot,
      gunner: crew.gunner,
      sinkings: score?.sinkings ?? lines.filter((l) => l.type === "sunk" && l.by === ship).length,
      shots,
      hits,
      blocked,
      accuracy: shots > 0 ? hits / shots : null,
      boostEnergy: score?.boostEnergy ?? (lastPosition?.boostEnergy as number | undefined) ?? 0,
      shieldEnergy: score?.shieldEnergy ?? (lastPosition?.shieldEnergy as number | undefined) ?? 0,
      emptySeconds: emptyMs / 1000,
      averageSurvivalSeconds: lifeLengths.length ? lifeLengths.reduce((a, b) => a + b, 0) / lifeLengths.length / 1000 : 0,
      lives: lifeLengths.length,
    };
  });

  return {
    room: (start?.room as string | undefined) ?? null,
    durationSeconds: endT / 1000,
    winner: (end?.winner as number | null | undefined) ?? null,
    endedEarly: (end?.endedEarly as boolean | undefined) ?? false,
    complete: end !== undefined,
    crews: summaries,
  };
}

/** m:ss, rounding the whole time first so 179.5 s reads 3:00, never 2:60. */
const clock = (seconds: number) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};
const r1 = (n: number) => String(Math.round(n * 10) / 10);

export function formatSummary(s: MatchSummary): string {
  // Players know the crews as Crew 1 and Crew 2; the log's ship ids start at 0.
  const result = !s.complete ? "Log ends before the match did" : s.winner === null ? "Draw" : `Crew ${s.winner + 1} wins`;
  const header = `Room ${s.room ?? "?"} · ${clock(s.durationSeconds)} · ${result}${s.endedEarly ? " (ended early by the host)" : ""}`;
  const rows = s.crews.map((c) => [
    `Crew ${c.ship + 1}`,
    [c.pilot, c.gunner].map((n) => n ?? "—").join(" & "),
    String(c.sinkings),
    String(c.shots),
    String(c.hits),
    String(c.blocked),
    c.accuracy === null ? "—" : `${Math.round(c.accuracy * 100)}%`,
    `${r1(c.boostEnergy)} / ${r1(c.shieldEnergy)}`,
    `${r1(c.emptySeconds)} s`,
    `${r1(c.averageSurvivalSeconds)} s (${c.lives})`,
  ]);
  const head = ["Crew", "Pilot & Gunner", "Sinkings", "Shots", "Hits", "Blocked", "Accuracy", "Energy boost / shield", "Empty bar", "Avg survival (lives)"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  return [header, "", fmt(head), fmt(widths.map((w) => "-".repeat(w))), ...rows.map(fmt)].join("\n");
}
