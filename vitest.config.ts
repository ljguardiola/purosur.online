import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import {
  ROOT_SLOW_TEST_THRESHOLD,
  SlowTestsReporter,
} from "./.github/scripts/slow-tests-reporter.mjs";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@purosur/domain": r("./packages/domain/src/index.ts"),
      "@purosur/contracts": r("./packages/contracts/src/index.ts"),
      "@purosur/ui": r("./packages/ui/src/index.ts"),
    },
  },
  test: {
    passWithNoTests: true,
    // Off, in favor of SlowTestsReporter below: one threshold for every kind of test would mark
    // whichever kind is naturally slower (e.g. browser tests) slow on every run.
    slowTestThreshold: ROOT_SLOW_TEST_THRESHOLD,
    reporters: [
      ...configDefaults.reporters,
      new SlowTestsReporter({
        node: 1000,
        // Same kind as "node" below: plain in-process Node tests.
        "railway-iac": 1000,
        "cloud-integration": 5000,
        browser: 2000,
      }),
    ],
    // File extension routes a test to its project: .test.ts runs headless under
    // Node, .test.tsx runs in a real Chromium tab with every package/app's DOM
    // and CSS available, including the setup file below.
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
          // Runs on its own dedicated Postgres container instead (see the "cloud-integration"
          // project below): these need a real Postgres, not this project's PGlite-friendly setup.
          exclude: ["apps/cloud/src/*/*.integration.test.ts"],
          environment: "node",
          globalSetup: [r("./apps/cloud/vitest.global-setup.ts")],
        },
      },
      {
        test: {
          name: "railway-iac",
          include: [".railway/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "cloud-integration",
          include: ["apps/cloud/src/*/*.integration.test.ts"],
          environment: "node",
          // One real Postgres container (Testcontainers) for the whole run, required rather than
          // skipped when Docker is unavailable: see apps/cloud/vitest.global-setup.postgres.ts.
          globalSetup: [r("./apps/cloud/vitest.global-setup.postgres.ts")],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        plugins: [react(), tailwindcss()],
        test: {
          name: "browser",
          include: ["packages/*/src/**/*.test.tsx", "apps/*/src/**/*.test.tsx"],
          // Shared across every package/app's browser tests: it loads packages/ui's
          // compiled design tokens, since the design system is meant to back all of them.
          setupFiles: [r("./packages/ui/src/test/setup-browser.ts")],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
