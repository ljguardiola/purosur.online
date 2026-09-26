import { defineConfig } from "vitest/config";

// Separate on purpose: these launch the built app with Playwright's Electron driver and need a
// display, so `pnpm verify` (Linux, no display) must never collect them.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    environment: "node",
    // One Electron instance at a time: launching several together would compete for the same
    // display and make the restart/timing assertions flaky.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
