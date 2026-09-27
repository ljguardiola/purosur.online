export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.mutation.config.ts" },
  mutate: [
    "packages/domain/src/**/*.ts",
    "packages/contracts/src/**/*.ts",
    "!packages/*/src/**/*.test.ts",
  ],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "progress"],
  clearTextReporter: { logTests: false },
  thresholds: { high: 100, low: 100, break: 100 },
};
