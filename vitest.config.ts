import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
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
    alias: [
      { find: /^@purosur\/domain$/, replacement: r("./packages/domain/src/index.ts") },
      { find: /^@purosur\/contracts$/, replacement: r("./packages/contracts/src/index.ts") },
      { find: /^@purosur\/ui$/, replacement: r("./packages/ui/src/index.ts") },
    ],
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
        plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
        resolve: {
          // `optimizeDeps.include` entries resolve from the workspace root, which has no react of
          // its own; this alias gives Vite a resolvable path so the compiler's import gets
          // pre-bundled instead of served with broken CommonJS interop.
          alias: {
            "react/compiler-runtime": createRequire(r("./apps/backoffice/package.json")).resolve(
              "react/compiler-runtime",
            ),
          },
        },
        optimizeDeps: { include: ["react/compiler-runtime"] },
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
