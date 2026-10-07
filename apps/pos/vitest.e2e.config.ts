import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

// Separate on purpose: these launch the built app with Playwright's Electron driver and need a
// display, so `pnpm verify` (Linux, no display) must never collect them.
export default defineConfig({
  ssr: {
    resolve: {
      // Vitest's own default leaves out `module`, which some dependencies point at ES modules Node
      // cannot load (extensionless relative imports); replacing the conditions must keep that out.
      conditions: [
        "@purosur/source",
        ...defaultServerConditions.filter((condition) => condition !== "module"),
      ],
    },
  },
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    environment: "node",
    // One Electron instance at a time: launching several together would compete for the same
    // display and make the restart/timing assertions flaky.
    fileParallelism: false,
    // No limit: each test waits for the condition it checks however long the machine takes, and the
    // job's own timeout ends a run where one never comes.
    testTimeout: 0,
    hookTimeout: 0,
  },
});
