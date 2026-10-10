import { defineConfig } from "vitest/config";

// Separate on purpose: these start the packaged register, which only exists after `pack:staging`,
// so neither `pnpm verify` nor `test:e2e` may collect them.
export default defineConfig({
  test: {
    include: ["e2e/**/*.packaged.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 0,
    hookTimeout: 0,
  },
});
