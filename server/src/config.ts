import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 2567;

/** Built client files, served by the game server on the same port. */
export const CLIENT_DIST_DIR = fileURLToPath(new URL("../../client/dist", import.meta.url));

export function resolvePort(env: Record<string, string | undefined>): number {
  const port = Number(env.PORT);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}
