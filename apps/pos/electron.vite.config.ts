import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import reactCompiler from "babel-plugin-react-compiler";
import { defineConfig } from "electron-vite";
import { defaultClientConditions, defaultServerConditions, type Plugin } from "vite";
import { withoutPackageOutput } from "../../.github/scripts/without-package-output.mjs";
import { buildContentSecurityPolicy } from "./src/main/content-security-policy";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const repoRoot = r("../../");

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
    plugins: [withoutPackageOutput(repoRoot)],
    ssr: { resolve: { conditions: ["@purosur/source", ...defaultServerConditions] } },
    build: {
      // electron-vite externalizes every package.json dependency by default, which would leave
      // workspace packages as bare imports at runtime; only `electron`, Node built-ins and
      // better-sqlite3, whose native binding can't be bundled, stay external.
      externalizeDeps: false,
      rollupOptions: {
        external: ["better-sqlite3"],
        input: {
          index: r("src/main/index.ts"),
          // Emitted next to index.js, so main finds it with a plain relative path.
          core: r("src/core/index.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [withoutPackageOutput(repoRoot)],
    build: {
      rollupOptions: {
        // A sandboxed preload can't be an ES module, and a .js file inside a "type": "module"
        // package would be read as one.
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    resolve: { conditions: ["@purosur/source", ...defaultClientConditions] },
    plugins: [
      withoutPackageOutput(repoRoot),
      react({ babel: { plugins: [reactCompiler] } }),
      tailwindcss(),
      contentSecurityPolicyMeta(),
    ],
    build: {
      rollupOptions: {
        input: {
          index: r("src/renderer/index.html"),
        },
      },
    },
  },
});
