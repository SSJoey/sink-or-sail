import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSeaSize, type Sea, type StormTimes } from "@sink-or-sail/shared";

export const DEFAULT_PORT = 2567;

/** Built client files, served by the game server on the same port. */
export const CLIENT_DIST_DIR = fileURLToPath(new URL("../../client/dist", import.meta.url));

/** The repo's logs/ folder (in Docker, /app/logs, mounted from the laptop). */
export const REPO_LOG_DIR = fileURLToPath(new URL("../../logs", import.meta.url));

/**
 * Match event logs: LOG_DIR when set, otherwise the repo's logs/ folder. Under Vitest (which sets VITEST) they
 * go to a temporary folder instead, so tests started from any folder never write to the real logs/.
 */
export function logDir(env: Record<string, string | undefined>): string {
  if (env.LOG_DIR !== undefined) return env.LOG_DIR;
  return env.VITEST !== undefined ? join(tmpdir(), "sink-or-sail-test-logs") : REPO_LOG_DIR;
}

export const LOG_DIR = logDir(process.env);

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
 * SEA_SIZE ("3200x1800" or "4000x2250") gives every match that bigger sea whatever its number of ships, for the
 * browser tests and for trying a big sea before there are enough ships (Stage 5); null (the size for the number of
 * ships) unless it names one of the agreed sizes.
 */
export function fixedSeaSize(env: Record<string, string | undefined>): Sea | null {
  return parseSeaSize(env.SEA_SIZE);
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

/**
 * JOIN_ADDRESS: the laptop's Wi-Fi address (from `hostname -I`, passed in by Docker at start), which the QR code
 * uses when the page itself was opened as localhost. Only an IPv4 address or a plain host name; empty otherwise.
 */
export function joinAddress(env: Record<string, string | undefined>): string {
  const address = (env.JOIN_ADDRESS ?? "").trim();
  return /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(address) ? address : "";
}
