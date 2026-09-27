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

process.env["TZ"] = "UTC";

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@purosur/domain": r("./packages/domain/src/index.ts"),
      "@purosur/contracts": r("./packages/contracts/src/index.ts"),
      "@purosur/ui/test": r("./packages/ui/src/test/index.ts"),
      "@purosur/ui": r("./packages/ui/src/index.ts"),
    },
  },
  test: {
    passWithNoTests: true,
    slowTestThreshold: ROOT_SLOW_TEST_THRESHOLD,
    reporters: [
      ...configDefaults.reporters,
      new SlowTestsReporter({
        node: 1000,
        "railway-iac": 1000,
        "cloud-integration": 5000,
        browser: 2000,
      }),
    ],
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
          exclude: ["apps/cloud/src/**/*.integration.test.ts"],
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
          include: ["apps/cloud/src/**/*.integration.test.ts"],
          environment: "node",
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
          setupFiles: [r("./packages/ui/src/test/setup-browser.ts")],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            // Vitest would otherwise name this project "browser (chromium)", which matches no
            // SlowTestsReporter threshold.
            instances: [{ browser: "chromium", name: "browser" }],
          },
        },
      },
    ],
  },
});
