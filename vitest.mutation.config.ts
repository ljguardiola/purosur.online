import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/domain/src/**/*.test.ts", "packages/contracts/src/**/*.test.ts"],
    environment: "node",
  },
});
