import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import { buildContentSecurityPolicy } from "./src/main/content-security-policy";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Chosen the same way as in electron-builder.config.mjs, so the built code reports the channel it
// is packaged for.
const channel = process.env.POS_CHANNEL === "homologation" ? "homologation" : "production";
const channelDefine = { "import.meta.env.POS_CHANNEL": JSON.stringify(channel) };

// A page loaded from file:// gets no response headers, so the packaged interface can only receive
// its policy from the page itself.
function contentSecurityPolicyMeta(): Plugin {
  return {
    name: "purosur:content-security-policy-meta",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: buildContentSecurityPolicy({ delivery: "meta" }),
        },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig({
  main: {
    define: channelDefine,
    build: {
      // electron-vite externalizes every entry in package.json's `dependencies` by default, which
      // would leave workspace packages as bare imports resolving to their TypeScript sources at
      // runtime. Everything is bundled instead; only `electron` and Node built-ins stay external.
      externalizeDeps: false,
      rollupOptions: {
        input: {
          index: r("src/main/index.ts"),
          // Emitted next to index.js, so main finds it with a plain relative path.
          core: r("src/core/index.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        // A sandboxed preload can't be an ES module, and a .js file inside a "type": "module"
        // package would be read as one.
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    define: channelDefine,
    root: "src/renderer",
    resolve: {
      alias: {
        "@purosur/domain": r("../../packages/domain/src/index.ts"),
        "@purosur/contracts": r("../../packages/contracts/src/index.ts"),
        "@purosur/ui": r("../../packages/ui/src/index.ts"),
      },
    },
    plugins: [react(), tailwindcss(), contentSecurityPolicyMeta()],
    build: {
      rollupOptions: {
        input: {
          index: r("src/renderer/index.html"),
        },
      },
    },
  },
});
