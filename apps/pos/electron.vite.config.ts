import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import reactCompiler from "babel-plugin-react-compiler";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import { buildContentSecurityPolicy } from "./src/main/content-security-policy";
import { withoutPackageOutput } from "./src/without-package-output";

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
    resolve: {
      // Contracts' and domain's package.json point `main` at their compiled dist/, which the register's
      // build never produces, so it reads their source instead.
      alias: [
        { find: /^@purosur\/contracts$/, replacement: r("../../packages/contracts/src/index.ts") },
        { find: /^@purosur\/domain$/, replacement: r("../../packages/domain/src/index.ts") },
        {
          find: /^@purosur\/domain\/sync\/use-cases$/,
          replacement: r("../../packages/domain/src/sync/use-cases/index.ts"),
        },
      ],
    },
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
    resolve: {
      alias: [
        { find: /^@purosur\/contracts$/, replacement: r("../../packages/contracts/src/index.ts") },
        { find: /^@purosur\/domain$/, replacement: r("../../packages/domain/src/index.ts") },
        { find: /^@purosur\/ui$/, replacement: r("../../packages/ui/src/index.ts") },
      ],
    },
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
