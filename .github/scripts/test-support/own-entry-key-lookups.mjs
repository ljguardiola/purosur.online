import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    noEmit: true,
    noUncheckedIndexedAccess: true,
    jsx: "preserve",
  },
  include: ["apps", "packages"],
});

export function projectWith(t, files) {
  const root = mkdtempSync(join(tmpdir(), "own-entry-key-lookups-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries({ "tsconfig.json": TSCONFIG, ...files })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), source);
  }
  return root;
}
