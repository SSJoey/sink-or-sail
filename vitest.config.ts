import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "shared", include: ["shared/src/**/*.test.ts"] } },
      { test: { name: "server", include: ["server/src/**/*.test.ts"] } },
      { test: { name: "client", include: ["client/src/**/*.test.ts"] } },
    ],
  },
});
