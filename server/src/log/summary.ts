// Turns a match log (JSON Lines) into per-crew numbers for tuning and playtest notes.

import { LAYOUTS, isLayoutId } from "@sink-or-sail/shared";

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
  /** Stage 2: times this crew was sunk, by cause (logs from before Stage 2 have none). */
  sunkBy: Partial<Record<string, number>>;
  /** Stage 2: reefs entered with damage, and the damage taken. */
  reefHits: number;
  reefDamage: number;
}

/** Stage 2: Last Afloat figures for one crew. */
export interface CrewLastAfloat {
  ship: number;
  /** 1 for the winner; crews out later place higher; equal finishes share a place. */
  place: number;
  /** Time on the water, not counting respawn waits, until the crew was out or the match ended. */
  afloatSeconds: number;
  /** Sinkings taken. */
  livesUsed: number;
}

type SlotPack = "mine" | "torpedo" | "emp";
type AnyPack = SlotPack | "health";

/** Stage 1 figures for one crew (only when packs were on). */
export interface CrewPacks {
  ship: number;
  pickedUp: Record<AnyPack, number>;
  /** Health is applied on pickup, so it is never used or lost. */
  used: Record<SlotPack, number>;
  lost: Record<SlotPack, number>;
  /** Pickup to use, for packs that were used; null if none were. */
  averageHeldSeconds: number | null;
  torpedoesFired: number;
  torpedoHits: number;
  /** torpedoHits ÷ torpedoesFired; null if none were fired. */
  torpedoAccuracy: number | null;
  /** Ships hit by blasts this crew set off (its own mine touched, or any mine it shot), other than its own ship. */
  mineHits: number;
  /** This crew's own ship caught in a blast it set off. */
  ownMineHits: number;
  empsFired: number;
  shipsCaught: number;
  /** shipsCaught ÷ empsFired; null if none were fired. */
  caughtPerEmp: number | null;
  healthRestored: number;
}

export interface MatchSummary {
  room: string | null;
  durationSeconds: number;
  winner: number | null;
  endedEarly: boolean;
  /** False when the log has no matchEnd (e.g. everyone left mid-match). */
  complete: boolean;
  /** Logs from before packs existed don't say; they played as packs off. */
  packsOn: boolean;
  /** Stage 2; logs from before modes existed are Sink Count. */
  mode: "sinkCount" | "lastAfloat";
  /** Last Afloat's lives per ship; null in Sink Count. */
  lives: number | null;
  /** Stage 2: the layout's name ("One Island" for logs from before layouts), and whether Random picked it. */
  layout: string;
  layoutRandom: boolean;
  /** Stage 2: hazards on (logs from before hazards: off) and the reefs setting ("none" with hazards off). */
  hazardsOn: boolean;
  reefs: string;
  /** "time", "lastAfloat" or "endedEarly"; null if the log doesn't say. */
  endReason: string | null;
  crews: CrewSummary[];
  /** Per crew, in the same order as crews; null in Sink Count. */
  lastAfloat: CrewLastAfloat[] | null;
  /** Per crew, in the same order as crews; null with packs off. */
  packs: CrewPacks[] | null;
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
type Score = { ship: number; sinkings: number; livesLeft?: number; boostEnergy: number; shieldEnergy: number };

export function summarise(lines: readonly Line[]): MatchSummary {
  const start = lines.find((l) => l.type === "matchStart");
  const end = lines.find((l) => l.type === "matchEnd");
  const endT = end?.t ?? lines.at(-1)?.t ?? 0;
  const crews = (start?.crews as Crew[] | undefined) ?? [];
  const scores = end?.scores as Score[] | undefined;

  // Time on the water per ship (all its lives, without respawn waits), for Last Afloat.
  const afloat = new Map<number, number>();
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
    afloat.set(ship, lifeLengths.reduce((a, b) => a + b, 0) / 1000);
    const sunkBy: Partial<Record<string, number>> = {};
    for (const l of mine("sunk")) if (typeof l.cause === "string") sunkBy[l.cause] = (sunkBy[l.cause] ?? 0) + 1;

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
      sunkBy,
      reefHits: mine("reefHit").length,
      reefDamage: Math.round(mine("reefHit").reduce((sum, l) => sum + (l.damage as number), 0) * 10) / 10,
    };
  });

  const packsOn = start?.packsOn === true;
  const mode = start?.mode === "lastAfloat" ? "lastAfloat" : "sinkCount";
  const winner = (end?.winner as number | null | undefined) ?? null;
  return {
    room: (start?.room as string | undefined) ?? null,
    durationSeconds: endT / 1000,
    winner,
    endedEarly: (end?.endedEarly as boolean | undefined) ?? false,
    complete: end !== undefined,
    packsOn,
    mode,
    lives: mode === "lastAfloat" ? ((start?.lives as number | undefined) ?? null) : null,
    endReason: (end?.reason as string | undefined) ?? null,
    layout: LAYOUTS[isLayoutId(start?.layout) ? start.layout : "oneIsland"].name,
    layoutRandom: start?.layoutRandom === true,
    hazardsOn: start?.hazardsOn === true,
    reefs: start?.hazardsOn === true && typeof start?.reefs === "string" ? start.reefs : "none",
    crews: summaries,
    lastAfloat: mode === "lastAfloat" ? lastAfloatFigures(lines, crews, scores, winner, endT, afloat) : null,
    packs: packsOn ? crews.map((c) => packFigures(lines, c.ship)) : null,
  };
}

function lastAfloatFigures(
  lines: readonly Line[],
  crews: readonly Crew[],
  scores: readonly Score[] | undefined,
  winner: number | null,
  endT: number,
  afloat: ReadonlyMap<number, number>,
): CrewLastAfloat[] {
  // Finishing order: the winner, then crews still in at the end (more lives left first), then crews out later.
  const rank = (ship: number) => {
    if (ship === winner) return Infinity;
    const out = lines.find((l) => l.type === "crewOut" && l.ship === ship);
    return out ? out.t : endT + 1 + (scores?.find((s) => s.ship === ship)?.livesLeft ?? 0);
  };
  return crews.map((c) => ({
    ship: c.ship,
    place: 1 + crews.filter((o) => rank(o.ship) > rank(c.ship)).length,
    afloatSeconds: afloat.get(c.ship) ?? 0,
    livesUsed: lines.filter((l) => l.type === "sunk" && l.ship === c.ship).length,
  }));
}

const slotCounts = (): Record<SlotPack, number> => ({ mine: 0, torpedo: 0, emp: 0 });

function packFigures(lines: readonly Line[], ship: number): CrewPacks {
  const pickedUp: Record<AnyPack, number> = { ...slotCounts(), health: 0 };
  const used = slotCounts();
  const lost = slotCounts();
  const heldMs: number[] = [];
  // When each slot's pack was picked up: the pilot's (mine) and the gunner's (torpedo or EMP) are timed apart.
  const pickedUpAt: Record<"pilot" | "gunner", number | null> = { pilot: null, gunner: null };
  const slotOf = (p: SlotPack) => (p === "mine" ? "pilot" : "gunner");
  let torpedoesFired = 0;
  let torpedoHits = 0;
  let mineHits = 0;
  let ownMineHits = 0;
  let empsFired = 0;
  let shipsCaught = 0;
  let healthRestored = 0;

  for (const l of lines) {
    if (l.type === "mineTriggered") {
      // Whoever set the blast off gets its hits: the shooter, or the owner when a ship touched it.
      const by = (l.shooter as number | null) ?? (l.owner as number);
      if (by !== ship) continue;
      for (const h of l.hits as { ship: number }[]) {
        if (h.ship === ship) ownMineHits++;
        else mineHits++;
      }
      continue;
    }
    if (l.ship !== ship) continue;
    const pack = l.packType as AnyPack;
    switch (l.type) {
      case "packPickedUp":
        pickedUp[pack]++;
        if (pack !== "health") pickedUpAt[slotOf(pack)] = l.t;
        break;
      case "packUsed": {
        used[pack as SlotPack]++;
        const since = pickedUpAt[slotOf(pack as SlotPack)];
        if (since !== null) heldMs.push(l.t - since);
        pickedUpAt[slotOf(pack as SlotPack)] = null;
        break;
      }
      case "packLost":
        lost[pack as SlotPack]++;
        pickedUpAt[slotOf(pack as SlotPack)] = null;
        break;
      case "torpedoFired": torpedoesFired++; break;
      case "torpedoHit": torpedoHits++; break;
      case "empFired":
        empsFired++;
        shipsCaught += (l.caught as number[]).length;
        break;
      case "healthRestored": healthRestored += l.amount as number; break;
    }
  }

  return {
    ship,
    pickedUp,
    used,
    lost,
    averageHeldSeconds: heldMs.length ? heldMs.reduce((a, b) => a + b, 0) / heldMs.length / 1000 : null,
    torpedoesFired,
    torpedoHits,
    torpedoAccuracy: torpedoesFired > 0 ? torpedoHits / torpedoesFired : null,
    mineHits,
    ownMineHits,
    empsFired,
    shipsCaught,
    caughtPerEmp: empsFired > 0 ? shipsCaught / empsFired : null,
    healthRestored: Math.round(healthRestored * 10) / 10,
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
  const header = `Room ${s.room ?? "?"} · ${clock(s.durationSeconds)} · ${result}${s.endedEarly ? " (ended early by the host)" : ""} · Packs ${s.packsOn ? "on" : "off"} · ${modeText(s)} · ${s.layout}${s.layoutRandom ? " (Random)" : ""} · ${hazardsText(s)}`;
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
    Object.entries(c.sunkBy).map(([cause, n]) => `${cause} ${n}`).join(" · ") || "—",
    ...(s.hazardsOn ? [`${c.reefHits} (${r1(c.reefDamage)})`] : []),
  ]);
  const head = ["Crew", "Pilot & Gunner", "Sinkings", "Shots", "Hits", "Blocked", "Accuracy", "Energy boost / shield", "Empty bar", "Avg survival (lives)", "Sunk by", ...(s.hazardsOn ? ["Reef hits (damage)"] : [])];
  const out = [header, "", ...table(head, rows)];
  if (s.lastAfloat) {
    const laRows = s.lastAfloat.map((c) => [`Crew ${c.ship + 1}`, ordinal(c.place), `${r1(c.afloatSeconds)} s`, String(c.livesUsed)]);
    out.push("", "Last Afloat", ...table(["Crew", "Place", "Time afloat", "Lives used"], laRows));
  }
  if (s.packs) out.push("", "Packs", ...table(PACK_HEAD, s.packs.map(packRow)));
  return out.join("\n");
}

const REEF_NAMES: Record<string, string> = { none: "None", few: "Few", all: "All" };
const hazardsText = (s: MatchSummary) => (s.hazardsOn ? `Hazards on, reefs ${REEF_NAMES[s.reefs] ?? s.reefs}` : "Hazards off");
const modeText = (s: MatchSummary) => (s.mode === "lastAfloat" ? `Last Afloat, ${s.lives ?? "?"} lives` : "Sink Count");
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

function table(head: string[], rows: string[][]): string[] {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  return [fmt(head), fmt(widths.map((w) => "-".repeat(w))), ...rows.map(fmt)];
}

const PACK_HEAD = ["Crew", "Picked up", "Used", "Lost", "Avg held", "Torpedo hits", "Mine hits", "EMPs", "Health restored"];
const LETTERS: Record<AnyPack, string> = { mine: "M", torpedo: "T", emp: "E", health: "H" };
const byType = (counts: Partial<Record<AnyPack, number>>) =>
  (Object.keys(counts) as AnyPack[]).map((p) => `${LETTERS[p]}${counts[p]}`).join(" ");

function packRow(p: CrewPacks): string[] {
  return [
    `Crew ${p.ship + 1}`,
    byType(p.pickedUp),
    byType(p.used),
    byType(p.lost),
    p.averageHeldSeconds === null ? "—" : `${r1(p.averageHeldSeconds)} s`,
    `${p.torpedoHits}/${p.torpedoesFired}${p.torpedoAccuracy === null ? "" : ` (${Math.round(p.torpedoAccuracy * 100)}%)`}`,
    `${p.mineHits} (own ${p.ownMineHits})`,
    p.caughtPerEmp === null ? String(p.empsFired) : `${p.empsFired} · ${r1(p.caughtPerEmp)} per EMP`,
    r1(p.healthRestored),
  ];
}
