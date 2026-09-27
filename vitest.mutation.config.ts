import { defineConfig } from "vitest/config";

// Set on the main thread, not in test.env: Stryker runs Vitest in worker threads, which cannot
// change the process's time zone.
process.env.TZ = "UTC";

export default defineConfig({
  test: {
    include: ["packages/domain/src/**/*.test.ts", "packages/contracts/src/**/*.test.ts"],
    environment: "node",
  },
});
