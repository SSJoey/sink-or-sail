import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "shared", include: ["shared/src/**/*.test.ts"] } },
      // Room tests each boot a Colyseus test server on the same port, so server files run one at a time.
      { test: { name: "server", include: ["server/src/**/*.test.ts"], fileParallelism: false } },
      { test: { name: "client", include: ["client/src/**/*.test.ts"] } },
    ],
  },
});
