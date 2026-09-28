import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import {
  ROOT_SLOW_TEST_THRESHOLD,
  SlowTestsReporter,
} from "./.github/scripts/slow-tests-reporter.mjs";

const CATALOG_VISUAL_WS_ENDPOINT_ENV = "CATALOG_VISUAL_BROWSER_WS_ENDPOINT";

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
        "catalog-visual": 4000,
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
      {
        plugins: [react(), tailwindcss()],
        test: {
          name: "catalog-visual",
          include: ["packages/ui/src/**/*.visual.tsx"],
          setupFiles: [
            r("./packages/ui/src/test/setup-browser.ts"),
            r("./packages/ui/src/test-support/setup-catalog-visual.ts"),
          ],
          globalSetup: [r("./packages/ui/vitest.global-setup.catalog-visual.ts")],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              connectOptions: {
                // A getter, not a plain value: Vite reads this config once before globalSetup
                // runs, but the provider only calls it once it actually opens the browser.
                get wsEndpoint() {
                  return process.env[CATALOG_VISUAL_WS_ENDPOINT_ENV] ?? "";
                },
                exposeNetwork: "<loopback>",
              },
              contextOptions: {
                reducedMotion: "reduce",
                deviceScaleFactor: 1,
              },
            }),
            viewport: { width: 1280, height: 800 },
            instances: [{ browser: "chromium", name: "catalog-visual" }],
            expect: {
              toMatchScreenshot: {
                // The rendering environment is this project's container regardless of the host
                // OS, so a platform suffix in the reference file's name would only ever be noise.
                resolveScreenshotPath: ({
                  root,
                  testFileDirectory,
                  screenshotDirectory,
                  testFileName,
                  arg,
                  browserName,
                  ext,
                }) =>
                  path.resolve(
                    root,
                    testFileDirectory,
                    screenshotDirectory,
                    testFileName,
                    `${arg}-${browserName}${ext}`,
                  ),
              },
            },
          },
        },
      },
    ],
  },
});
