import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import {
  ROOT_SLOW_TEST_THRESHOLD,
  SlowTestsReporter,
} from "./.github/scripts/slow-tests-reporter.mjs";
import { withoutPackageOutput } from "./.github/scripts/without-package-output.mjs";

const PLAYWRIGHT_WS_ENDPOINT_ENV = "PLAYWRIGHT_SERVER_WS_ENDPOINT";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

process.env["TZ"] = "UTC";

function compiledReactProject() {
  return {
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
    // The browser has no `process`, yet react-aria's virtualizer reads `process.env` on every
    // layout, and it only virtualizes under NODE_ENV "test" when VIRT_ON is set.
    define: { "process.env.NODE_ENV": '"test"', "process.env.VIRT_ON": '"true"' },
  };
}

function playwrightServerConnectOptions() {
  return {
    // A getter, not a plain value: Vite reads this config once before globalSetup runs, but the
    // provider only calls it once it actually opens the browser.
    get wsEndpoint() {
      return process.env[PLAYWRIGHT_WS_ENDPOINT_ENV] ?? "";
    },
    exposeNetwork: "<loopback>",
  };
}

export default defineConfig({
  plugins: [withoutPackageOutput(r("."))],
  resolve: {
    dedupe: ["react", "react-dom"],
    conditions: ["@purosur/source", ...defaultClientConditions],
  },
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
    passWithNoTests: true,
    slowTestThreshold: ROOT_SLOW_TEST_THRESHOLD,
    reporters: [
      ...configDefaults.reporters,
      new SlowTestsReporter({
        node: 1000,
        "railway-iac": 1000,
        "backoffice-build": 1000,
        "served-backoffice": 1000,
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
          name: "backoffice-build",
          include: ["apps/backoffice/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "served-backoffice",
          include: ["apps/cloud/*.test.ts"],
          environment: "node",
          globalSetup: [r("./vitest.global-setup.playwright-server.ts")],
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
        ...compiledReactProject(),
        test: {
          name: "browser",
          include: ["packages/*/src/**/*.test.tsx", "apps/*/src/**/*.test.tsx"],
          setupFiles: [r("./packages/ui/src/test/setup-browser.ts")],
          globalSetup: [r("./vitest.global-setup.playwright-server.ts")],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ connectOptions: playwrightServerConnectOptions() }),
            // Vitest would otherwise name this project "browser (chromium)", which matches no
            // SlowTestsReporter threshold.
            instances: [{ browser: "chromium", name: "browser" }],
          },
        },
      },
      {
        ...compiledReactProject(),
        test: {
          name: "catalog-visual",
          include: ["packages/ui/src/**/*.visual.tsx"],
          setupFiles: [
            r("./packages/ui/src/test/setup-browser.ts"),
            r("./packages/ui/src/test-support/setup-catalog-visual.ts"),
          ],
          globalSetup: [r("./vitest.global-setup.playwright-server.ts")],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              connectOptions: playwrightServerConnectOptions(),
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
