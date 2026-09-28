import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const backofficeDir = join(repoRoot, "apps/backoffice");
const posDir = join(repoRoot, "apps/pos");

// Vite prints an unrelated CommonJS-loading advisory for `vitest.config.ts` unless this is set.
process.env["VITE_CONFIG_NATIVE_IGNORE_WARNING"] = "true";

const COMPILER_RUNTIME_MARKER = "react.memo_cache_sentinel";

// A server whose config resolves `@purosur/*` to real workspace packages starts a background
// dependency scan on first use; since nothing here ever loads a page to let that scan finish,
// leaving discovery on hangs `server.close()` forever.
const NO_DEPENDENCY_DISCOVERY = { noDiscovery: true };

function requireFrom(packageJsonDir) {
  return createRequire(join(packageJsonDir, "package.json"));
}

async function withServer(config, run) {
  const vite = await import(requireFrom(backofficeDir).resolve("vite"));
  const server = await vite.createServer(config);
  try {
    return await run(server);
  } finally {
    await server.close();
  }
}

async function transformWithBackofficeConfig(url) {
  return withServer(
    {
      configFile: join(backofficeDir, "vite.config.ts"),
      root: backofficeDir,
      optimizeDeps: NO_DEPENDENCY_DISCOVERY,
      server: { middlewareMode: true, hmr: false, ws: false },
    },
    (server) => server.transformRequest(url),
  );
}

async function transformWithRendererConfig(url) {
  const requireFromPos = requireFrom(posDir);
  const electronVite = await import(requireFromPos.resolve("electron-vite"));
  const loaded = await electronVite.loadConfigFromFile(
    { command: "build", mode: "production" },
    join(posDir, "electron.vite.config.ts"),
    posDir,
  );
  const renderer = loaded.config.renderer;

  const vite = await import(requireFromPos.resolve("vite"));
  const server = await vite.createServer({
    ...renderer,
    root: resolve(posDir, renderer.root ?? "."),
    configFile: false,
    optimizeDeps: NO_DEPENDENCY_DISCOVERY,
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  try {
    return await server.transformRequest(url);
  } finally {
    await server.close();
  }
}

async function transformWithTestProjectConfig(projectName, url) {
  const vite = await import(requireFrom(backofficeDir).resolve("vite"));
  const loaded = await vite.loadConfigFromFile(
    { command: "serve", mode: "test" },
    join(repoRoot, "vitest.config.ts"),
    repoRoot,
    undefined,
    undefined,
    "bundle",
  );
  const testProject = loaded.config.test.projects.find(
    (project) => project.test?.name === projectName,
  );
  assert.ok(testProject, `the root vitest config no longer declares a "${projectName}" project`);

  const server = await vite.createServer({
    root: repoRoot,
    resolve: loaded.config.resolve,
    plugins: testProject.plugins,
    configFile: false,
    logLevel: "silent",
    optimizeDeps: NO_DEPENDENCY_DISCOVERY,
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  try {
    return await server.transformRequest(url);
  } finally {
    await server.close();
  }
}

test("the backoffice's Vite build compiles a real screen component with the React Compiler", async () => {
  const result = await transformWithBackofficeConfig("/src/access/access-layout.tsx");

  assert.ok(result, "the backoffice's dev server could not transform the component");
  assert.ok(result.code.includes(COMPILER_RUNTIME_MARKER));
});

test("the backoffice's Vite build leaves a plain, non-component module untouched by the compiler", async () => {
  const result = await transformWithBackofficeConfig("/src/platform/es-ar-number.ts");

  assert.ok(result, "the backoffice's dev server could not transform the module");
  assert.ok(!result.code.includes(COMPILER_RUNTIME_MARKER));
});

test("the register renderer's Vite build compiles a real screen component with the React Compiler", async () => {
  const result = await transformWithRendererConfig("/shell/core-down-notice.tsx");

  assert.ok(result, "the renderer's dev server could not transform the component");
  assert.ok(result.code.includes(COMPILER_RUNTIME_MARKER));
});

test("the root vitest config's browser project compiles a packages/ui component with the React Compiler", async () => {
  const result = await transformWithTestProjectConfig(
    "browser",
    "/packages/ui/src/components/IconButton.tsx",
  );

  assert.ok(result, "the browser project's dev server could not transform the component");
  assert.ok(result.code.includes(COMPILER_RUNTIME_MARKER));
});

test("the root vitest config's catalog-visual project compiles a packages/ui component with the React Compiler", async () => {
  const result = await transformWithTestProjectConfig(
    "catalog-visual",
    "/packages/ui/src/components/IconButton.tsx",
  );

  assert.ok(result, "the catalog-visual project's dev server could not transform the component");
  assert.ok(result.code.includes(COMPILER_RUNTIME_MARKER));
});
