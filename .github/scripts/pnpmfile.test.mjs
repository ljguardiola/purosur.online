import assert from "node:assert/strict";
import { test } from "node:test";
import { hooks } from "../../.pnpmfile.mjs";

function drizzleManifest() {
  return {
    name: "drizzle-orm",
    version: "0.45.2",
    peerDependencies: { "better-sqlite3": ">=7", "@types/better-sqlite3": "*", pg: ">=8" },
    peerDependenciesMeta: {
      "better-sqlite3": { optional: true },
      "@types/better-sqlite3": { optional: true },
      pg: { optional: true },
    },
  };
}

test("drizzle-orm stops declaring the register's SQLite driver as a peer", () => {
  const manifest = hooks.readPackage(drizzleManifest());

  assert.deepEqual(manifest.peerDependencies, { pg: ">=8" });
  assert.deepEqual(manifest.peerDependenciesMeta, { pg: { optional: true } });
});

test("any other package keeps its SQLite driver peer", () => {
  const manifest = hooks.readPackage({
    ...drizzleManifest(),
    name: "drizzle-kit",
  });

  assert.deepEqual(manifest, { ...drizzleManifest(), name: "drizzle-kit" });
});
