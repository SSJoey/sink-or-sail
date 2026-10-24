import { fileURLToPath } from "node:url";

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
