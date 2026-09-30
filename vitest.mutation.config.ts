import { fileURLToPath } from "node:url";
import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
import { withoutPackageOutput } from "./.github/scripts/without-package-output.mjs";

// Stryker runs Vitest in worker threads, which cannot change the process's time zone.
process.env["TZ"] = "UTC";

export default defineConfig({
  plugins: [withoutPackageOutput(fileURLToPath(new URL(".", import.meta.url)))],
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
    include: ["packages/domain/src/**/*.test.ts", "packages/contracts/src/**/*.test.ts"],
    environment: "node",
  },
});
