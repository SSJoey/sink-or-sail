import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "shared", include: ["shared/src/**/*.test.ts"] } },
      // Room tests each boot a Colyseus test server on the same port, so server files run one at a time.
      // Matches started by room tests log to a temporary folder, not the real logs/.
      { test: { name: "server", include: ["server/src/**/*.test.ts"], fileParallelism: false, env: { LOG_DIR: join(tmpdir(), "sink-or-sail-test-logs") } } },
      { test: { name: "client", include: ["client/src/**/*.test.ts"] } },
    ],
  },
});
