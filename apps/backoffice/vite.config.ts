import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@purosur/ui": r("../../packages/ui/src/index.ts"),
    },
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
  },
});
