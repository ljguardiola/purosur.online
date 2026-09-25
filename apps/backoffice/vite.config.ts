import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const REPO_ROOT = r("../..");

// Mirrors apps/cloud/src/edge-origin-guard.ts: the dev cloud process refuses every request
// (GET /health excepted) without this header, since there is no Cloudflare edge locally to set
// it. Read from the same .env the developer's `pnpm dev:cloud` run loads.
const EDGE_ORIGIN_SECRET_HEADER = "x-edge-origin-secret";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, "");

  // The cloud process a developer runs locally (see CONTRIBUTING.md's "Running it locally");
  // overridable only for a developer running the cloud on a non-default port.
  const LOCAL_CLOUD_ORIGIN = `http://localhost:${env.CLOUD_PORT ?? "3000"}`;

  const cloudApiProxy: ProxyOptions = {
    target: LOCAL_CLOUD_ORIGIN,
    configure(proxy) {
      proxy.on("proxyReq", (proxyReq) => {
        if (env.EDGE_ORIGIN_SECRET) {
          proxyReq.setHeader(EDGE_ORIGIN_SECRET_HEADER, env.EDGE_ORIGIN_SECRET);
        }
      });
    },
  };

  return {
    resolve: {
      alias: {
        "@purosur/contracts": r("../../packages/contracts/src/index.ts"),
        "@purosur/ui": r("../../packages/ui/src/index.ts"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: "dist",
    },
    server: {
      // The browser only ever talks to this Vite origin: every cloud API path is forwarded here
      // instead, so the cloud's Origin check (the recovery routes' `checkOrigin`, compared
      // against BACKOFFICE_ORIGIN) sees this origin, not the cloud's own, and stays exactly as
      // strict as it is in production. GET /health is exempt from the edge guard, so it needs no
      // header.
      proxy: {
        "/health": LOCAL_CLOUD_ORIGIN,
        "/users": cloudApiProxy,
        "/roles": cloudApiProxy,
        "/branch-settings": cloudApiProxy,
        "/categories": cloudApiProxy,
        "/products": cloudApiProxy,
      },
    },
  };
});
