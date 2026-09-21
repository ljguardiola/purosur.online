import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // `build.externalizeDeps` defaults to true for both `main` and `preload`, so node_modules
  // dependencies (electron, @sentry/electron, zod) stay external instead of being bundled.
  main: {
    build: {
      rollupOptions: {
        input: {
          // The core process is a second main-side entry (see the register's design doc, §5.1):
          // it lands next to index.js in out/main so apps/pos/src/main/index.ts can find it with
          // a plain relative path instead of a separate output directory.
          index: r("src/main/index.ts"),
          core: r("src/core/index.ts"),
        },
      },
    },
  },
  preload: {},
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        "@purosur/domain": r("../../packages/domain/src/index.ts"),
        "@purosur/contracts": r("../../packages/contracts/src/index.ts"),
        "@purosur/ui": r("../../packages/ui/src/index.ts"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          index: r("src/renderer/index.html"),
        },
      },
    },
  },
});
