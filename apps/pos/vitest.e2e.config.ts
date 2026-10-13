import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
import { UNBOUNDED_CALL_BACKSTOP_MS } from "./e2e/test-support/bounds";

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
    // Only a backstop: every wait carries its own bound and says what it waited for. This ends a call
    // no wait bounds, such as an evaluate against a main process that hangs.
    testTimeout: UNBOUNDED_CALL_BACKSTOP_MS,
    hookTimeout: UNBOUNDED_CALL_BACKSTOP_MS,
    setupFiles: ["e2e/test-support/print-logs-on-failure.setup.ts"],
  },
});
