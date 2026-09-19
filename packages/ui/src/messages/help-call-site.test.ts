import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const tscBinary = path.join(repoRoot, "node_modules/.bin/tsc");
const helpModulePath = fileURLToPath(new URL("./help", import.meta.url));

// A directory with no tsconfig.json of its own: tsc refuses to run with explicit compiler flags
// and files on the command line while an ambient tsconfig.json is also in scope.
const tmpRoot = mkdtempSync(path.join(tmpdir(), "help-call-site-"));

const tscFlags = [
  "--noEmit",
  "--strict",
  "--target",
  "es2022",
  "--module",
  "esnext",
  "--moduleResolution",
  "bundler",
  "--jsx",
  "react-jsx",
  "--exactOptionalPropertyTypes",
  "--noUncheckedIndexedAccess",
  "--verbatimModuleSyntax",
  "--skipLibCheck",
];

function typeCheckCall(fileName: string, body: string): { status: number | null; output: string } {
  const filePath = path.join(tmpRoot, fileName);
  writeFileSync(
    filePath,
    `import { defineHelp } from ${JSON.stringify(helpModulePath)};\n\n${body}\n`,
  );

  const result = spawnSync(tscBinary, [...tscFlags, filePath], { cwd: tmpRoot, encoding: "utf-8" });

  expect(result.error, `tsc failed to spawn: ${result.error}`).toBeUndefined();

  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("defineHelp's reference safety at the call site", () => {
  it("rejects a call whose article names a category it doesn't define", () => {
    const result = typeCheckCall(
      "bad-category.ts",
      `defineHelp("es-AR", {
        categories: { getting_started: "Primeros pasos" },
        articles: { intro: { category: "ghost", title: "Bienvenida", body: [] } },
      });`,
    );

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("ghost");
  });

  it("rejects a call whose related list names an article it doesn't define", () => {
    const result = typeCheckCall(
      "bad-related.ts",
      `defineHelp("es-AR", {
        categories: { getting_started: "Primeros pasos" },
        articles: { intro: { category: "getting_started", title: "B", body: [], related: ["ghost"] } },
      });`,
    );

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("ghost");
  });

  it("rejects a call whose articleLink names an article it doesn't define", () => {
    const result = typeCheckCall(
      "bad-article-link.ts",
      `defineHelp("es-AR", {
        categories: { getting_started: "Primeros pasos" },
        articles: {
          intro: { category: "getting_started", title: "B", body: [{ kind: "articleLink", article: "ghost" }] } },
      });`,
    );

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("ghost");
  });

  it("accepts a call whose category, related entry, and articleLink all point at real ids", () => {
    const result = typeCheckCall(
      "valid.ts",
      `defineHelp("es-AR", {
        categories: { getting_started: "Primeros pasos", billing: "Facturación" },
        articles: {
          intro: {
            category: "getting_started", title: "B", related: ["billing_basics"],
            body: [{ kind: "articleLink", article: "billing_basics" }],
          },
          billing_basics: { category: "billing", title: "B", body: [{ kind: "paragraph", text: "C" }] },
        },
      });`,
    );

    expect(result.status).toBe(0);
    expect(result.output).toBe("");
  });
});
