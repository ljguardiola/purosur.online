import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const REPO_ROOT = r("../..");

// The dev cloud process refuses every request (`GET /health` excepted) without this header,
// since there is no Cloudflare edge locally to set it.
const EDGE_ORIGIN_SECRET_HEADER = "x-edge-origin-secret";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, "");

  const LOCAL_CLOUD_ORIGIN = `http://localhost:${env["CLOUD_PORT"] ?? "3000"}`;

  const cloudApiProxy: ProxyOptions = {
    target: LOCAL_CLOUD_ORIGIN,
    configure(proxy) {
      proxy.on("proxyReq", (proxyReq) => {
        if (env["EDGE_ORIGIN_SECRET"]) {
          proxyReq.setHeader(EDGE_ORIGIN_SECRET_HEADER, env["EDGE_ORIGIN_SECRET"]);
        }
      });
    },
  };

  return {
    resolve: {
      alias: {
        "@purosur/contracts": r("../../packages/contracts/src/index.ts"),
        "@purosur/domain": r("../../packages/domain/src/index.ts"),
        "@purosur/ui": r("../../packages/ui/src/index.ts"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: "dist",
    },
    server: {
      // Every cloud API path is forwarded through this Vite origin, so the cloud's Origin check
      // sees the same origin it does in production.
      proxy: {
        "/health": LOCAL_CLOUD_ORIGIN,
        "/users": cloudApiProxy,
        "/roles": cloudApiProxy,
        "/branch-settings": cloudApiProxy,
        "/categories": cloudApiProxy,
        "/products": cloudApiProxy,
        "/prices": cloudApiProxy,
        "/fiscal-configuration": cloudApiProxy,
        "/alerts": cloudApiProxy,
        "/registers": cloudApiProxy,
      },
    },
  };
});
