import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptPath = join(repositoryRoot, ".github/scripts/biome-no-diagnostics.mjs");
const biomeBinary = join(repositoryRoot, "node_modules", ".bin", "biome");

const CLEAN_SOURCE = [
  "export function Greeting({ name }: { name: string }) {",
  "  return <p>{name}</p>;",
  "}",
  "",
].join("\n");

const INFO_ONLY_SOURCE = [
  'import { Component } from "react";',
  "",
  "export class Greeting extends Component<{ name: string }> {",
  "  override render() {",
  "    return <p>{this.props.name}</p>;",
  "  }",
  "}",
  "",
].join("\n");

const ERROR_SOURCE = [
  "export function Greeting({ name }: { name: string }) {",
  "  const unused = 1;",
  "  return <p>{name}</p>;",
  "}",
  "",
].join("\n");

function withProject(source, run) {
  const config = JSON.parse(readFileSync(join(repositoryRoot, "biome.json"), "utf8"));
  delete config.$schema;
  config.vcs = { enabled: false, clientKind: "git", useIgnoreFile: false };

  const root = mkdtempSync(join(tmpdir(), "biome-no-diagnostics-"));
  try {
    writeFileSync(join(root, "biome.json"), JSON.stringify(config, null, 2));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "greeting.tsx"), source);
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runGate(root) {
  return spawnSync(process.execPath, [scriptPath, "ci", "src"], { cwd: root, encoding: "utf8" });
}

test("passes when Biome reports no diagnostic", () => {
  withProject(CLEAN_SOURCE, (root) => {
    assert.equal(runGate(root).status, 0);
  });
});

test("fails when Biome reports only an info-level diagnostic, which Biome alone lets pass", () => {
  withProject(INFO_ONLY_SOURCE, (root) => {
    const biomeAlone = spawnSync(
      biomeBinary,
      ["ci", "src", "--error-on-warnings", "--colors=off"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    assert.equal(biomeAlone.status, 0);
    assert.match(biomeAlone.stdout, /Found 1 info/);

    const gate = runGate(root);
    assert.equal(gate.status, 1);
    assert.match(gate.stderr, /useReactFunctionComponents/);
    assert.match(gate.stderr, /Biome reported 1 diagnostic/);
  });
});

test("fails with Biome's own exit code when Biome itself fails", () => {
  withProject(ERROR_SOURCE, (root) => {
    const gate = runGate(root);
    assert.notEqual(gate.status, 0);
    assert.match(gate.stderr, /noUnusedVariables/);
  });
});

test("verify:static and lint run Biome through the gate", () => {
  const { scripts } = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));

  assert.match(
    scripts["verify:static"],
    /\bnode \.github\/scripts\/biome-no-diagnostics\.mjs ci \./,
  );
  assert.match(scripts.lint, /^node \.github\/scripts\/biome-no-diagnostics\.mjs check \.$/);
});
