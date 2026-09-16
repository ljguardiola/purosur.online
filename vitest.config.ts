import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@purosur/domain": r("./packages/domain/src/index.ts"),
      "@purosur/contracts": r("./packages/contracts/src/index.ts"),
      "@purosur/ui": r("./packages/ui/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
