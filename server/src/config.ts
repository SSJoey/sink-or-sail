import { fileURLToPath } from "node:url";
import type { StormTimes } from "@sink-or-sail/shared";

export const DEFAULT_PORT = 2567;

/** Built client files, served by the game server on the same port. */
export const CLIENT_DIST_DIR = fileURLToPath(new URL("../../client/dist", import.meta.url));

/** Match event logs: the repo's logs/ folder (in Docker, /app/logs, mounted from the laptop). Tests set LOG_DIR. */
export const LOG_DIR = process.env.LOG_DIR ?? fileURLToPath(new URL("../../logs", import.meta.url));

export function resolvePort(env: Record<string, string | undefined>): number {
  const port = Number(env.PORT);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}

/** MATCH_SEED fixes every match's random seed (replaying a logged match's packs, browser tests); null when unset. */
export function fixedSeed(env: Record<string, string | undefined>): number | null {
  const seed = Number(env.MATCH_SEED);
  return env.MATCH_SEED !== undefined && Number.isInteger(seed) && seed >= 0 ? seed : null;
}

/**
 * STORM_STARTS_AT and STORM_CLOSED_AT (match seconds) make the closing storm close sooner, for the browser tests
 * only; null (the tuning values) unless both are set, not negative, with closing after starting.
 */
export function fixedStormTimes(env: Record<string, string | undefined>): StormTimes | null {
  if (env.STORM_STARTS_AT === undefined || env.STORM_CLOSED_AT === undefined) return null;
  const startsAt = Number(env.STORM_STARTS_AT);
  const closedAt = Number(env.STORM_CLOSED_AT);
  return Number.isFinite(startsAt) && Number.isFinite(closedAt) && startsAt >= 0 && closedAt > startsAt ? { startsAt, closedAt } : null;
}

/**
 * HAZARDS_FIRST_AT (match seconds, or "never") sets when the first dynamic hazard comes, for the browser tests
 * only; undefined (the tuning value) unless it is "never" (null: none) or a number, not negative.
 */
export function firstHazardAt(env: Record<string, string | undefined>): number | null | undefined {
  if (env.HAZARDS_FIRST_AT === "never") return null;
  const at = Number(env.HAZARDS_FIRST_AT);
  return env.HAZARDS_FIRST_AT !== undefined && Number.isFinite(at) && at >= 0 ? at : undefined;
}

/**
 * TEST_SINK ("crew@seconds", crews numbered from 1) sinks that crew's ship at that match time, for the browser
 * tests only (the ghost test); null unless it names Crew 1–3 and a time not negative.
 */
export function testSink(env: Record<string, string | undefined>): { ship: number; at: number } | null {
  const match = /^([1-3])@(\d+(?:\.\d+)?)$/.exec(env.TEST_SINK ?? "");
  return match ? { ship: Number(match[1]) - 1, at: Number(match[2]) } : null;
}
