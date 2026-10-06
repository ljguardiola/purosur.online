import { fileURLToPath } from "node:url";
import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
import { withoutPackageOutput } from "./.github/scripts/without-package-output.mjs";

process.env["TZ"] = "UTC";

export default defineConfig({
  plugins: [withoutPackageOutput(fileURLToPath(new URL(".", import.meta.url)))],
  ssr: {
    resolve: {
      conditions: [
        "@purosur/source",
        ...defaultServerConditions.filter((condition) => condition !== "module"),
      ],
    },
  },
  test: {
    include: ["apps/pos/src/core/sync/test-support/register-session-push.recorder.ts"],
    environment: "node",
  },
});
