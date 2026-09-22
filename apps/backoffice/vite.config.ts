import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The cloud process a developer runs locally (see CONTRIBUTING.md's "Running it locally");
// overridable only for a developer running the cloud on a non-default port.
const LOCAL_CLOUD_ORIGIN = `http://localhost:${process.env.CLOUD_PORT ?? "3000"}`;

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
  server: {
    // The browser only ever talks to this Vite origin: every cloud API path is forwarded here
    // instead, so the cloud's Origin check (the recovery routes' `checkOrigin`, compared against
    // BACKOFFICE_ORIGIN) sees this origin, not the cloud's own, and stays exactly as strict as it
    // is in production.
    proxy: {
      "/health": LOCAL_CLOUD_ORIGIN,
      "/users": LOCAL_CLOUD_ORIGIN,
    },
  },
});
