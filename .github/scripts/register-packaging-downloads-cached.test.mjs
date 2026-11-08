import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { describeViolation, findWorkflowFiles } from "./dependency-cache-bounded.mjs";
import {
  checkFiles,
  findPackagingCacheViolations,
  packagingScriptNames,
} from "./register-packaging-downloads-cached.mjs";

const CACHE_RESTORE = "actions/cache/restore@caa296126883cff596d87d8935842f9db880ef25 # v6.1.0";
const CACHE_SAVE = "actions/cache/save@caa296126883cff596d87d8935842f9db880ef25 # v6.1.0";
const CACHE = "actions/cache@caa296126883cff596d87d8935842f9db880ef25 # v6.1.0";
const CACHE_DIR = `\${{ github.workspace }}/../electron-builder-cache`;
const PACKAGING_SCRIPTS = ["pack:production", "pack:staging"];

function step(...lines) {
  return lines.map((line, i) => (i === 0 ? `      - ${line}` : `        ${line}`));
}

function cacheStep(uses, path = CACHE_DIR) {
  return step(
    `uses: ${uses}`,
    "continue-on-error: true",
    "timeout-minutes: 2",
    "with:",
    `  path: ${path}`,
    `  key: electron-builder-\${{ hashFiles('pnpm-lock.yaml') }}`,
  );
}

const PACK = step("run: pnpm --filter @purosur/pos pack:production");

function workflow({ jobEnv = [`ELECTRON_BUILDER_CACHE: ${CACHE_DIR}`], steps, workflowEnv = [] }) {
  return [
    ...(workflowEnv.length > 0 ? ["env:", ...workflowEnv.map((line) => `  ${line}`)] : []),
    "jobs:",
    "  package:",
    "    runs-on: windows-latest",
    "    timeout-minutes: 12",
    ...(jobEnv.length > 0 ? ["    env:", ...jobEnv.map((line) => `      ${line}`)] : []),
    "    steps:",
    "      - run: pnpm install --frozen-lockfile",
    ...steps.flat(),
  ].join("\n");
}

function violationsOf(source) {
  return findPackagingCacheViolations(source, PACKAGING_SCRIPTS);
}

function assertSingleViolation(violations, pattern) {
  assert.equal(violations.length, 1, violations.map((v) => v.message).join("\n"));
  assert.match(violations[0].message, pattern);
}

test("passes a job that restores electron-builder's cache before packaging and saves it after", () => {
  const violations = violationsOf(
    workflow({ steps: [cacheStep(CACHE_RESTORE), PACK, cacheStep(CACHE_SAVE)] }),
  );

  assert.deepEqual(violations, []);
});

test("passes a job whose single actions/cache step both restores and saves the cache", () => {
  assert.deepEqual(violationsOf(workflow({ steps: [cacheStep(CACHE), PACK] })), []);
});

test("passes a cache step that lists electron-builder's cache among other paths", () => {
  const path = `|\n    ~/other\n    ${CACHE_DIR}`;

  assert.deepEqual(
    violationsOf(
      workflow({ steps: [cacheStep(CACHE_RESTORE, path), PACK, cacheStep(CACHE_SAVE, path)] }),
    ),
    [],
  );
});

test("passes a cache step that names electron-builder's cache through the env context", () => {
  for (const path of [
    `\${{ env.ELECTRON_BUILDER_CACHE }}`,
    `\${{env.ELECTRON_BUILDER_CACHE}}`,
    `|\n    \${{ env.ELECTRON_BUILDER_CACHE }}\n    ~/other`,
  ]) {
    const violations = violationsOf(
      workflow({ steps: [cacheStep(CACHE_RESTORE, path), PACK, cacheStep(CACHE_SAVE, path)] }),
    );

    assert.deepEqual(violations, [], path);
  }
});

test("leaves alone a job that does not package the register", () => {
  const violations = violationsOf(
    workflow({ jobEnv: [], steps: [step("run: pnpm --filter @purosur/pos build")] }),
  );

  assert.deepEqual(violations, []);
});

test("flags a packaging step that runs with no electron-builder cache directory set", () => {
  const violations = violationsOf(
    workflow({ jobEnv: [], steps: [cacheStep(CACHE_RESTORE), PACK, cacheStep(CACHE_SAVE)] }),
  );

  assertSingleViolation(
    violations,
    /^package job packages the register without ELECTRON_BUILDER_CACHE/,
  );
  assert.equal(violations[0].line, 13);
});

test("reads the cache directory from the step's, the job's or the workflow's env, nearest first", () => {
  const stepEnv = step(
    "run: pnpm --filter @purosur/pos pack:production",
    "env:",
    `  ELECTRON_BUILDER_CACHE: ${CACHE_DIR}`,
  );
  const fromStep = workflow({
    jobEnv: ["ELECTRON_BUILDER_CACHE: elsewhere"],
    steps: [cacheStep(CACHE_RESTORE), stepEnv, cacheStep(CACHE_SAVE)],
  });
  const fromWorkflow = workflow({
    jobEnv: [],
    workflowEnv: [`ELECTRON_BUILDER_CACHE: ${CACHE_DIR}`],
    steps: [cacheStep(CACHE_RESTORE), PACK, cacheStep(CACHE_SAVE)],
  });

  assert.deepEqual(violationsOf(fromStep), []);
  assert.deepEqual(violationsOf(fromWorkflow), []);
});

test("flags a packaging step no earlier step restores the cache for", () => {
  for (const steps of [
    [PACK, cacheStep(CACHE_SAVE)],
    [cacheStep(CACHE_RESTORE, "~/elsewhere"), PACK, cacheStep(CACHE_SAVE)],
  ]) {
    const violations = violationsOf(workflow({ steps }));

    assertSingleViolation(
      violations,
      /^package job packages the register before any step restores/,
    );
  }
});

test("flags a packaging step whose cache no step saves", () => {
  for (const steps of [
    [cacheStep(CACHE_RESTORE), PACK],
    [cacheStep(CACHE_RESTORE), PACK, cacheStep(CACHE_SAVE, "~/elsewhere")],
    [cacheStep(CACHE_SAVE), cacheStep(CACHE_RESTORE), PACK],
  ]) {
    const violations = violationsOf(workflow({ steps }));

    assertSingleViolation(violations, /^package job never saves electron-builder's cache/);
  }
});

test("recognizes electron-builder run directly and every packaging script, with any arguments", () => {
  for (const run of [
    "npx electron-builder --win",
    "pnpm --filter @purosur/pos pack:staging",
    "pnpm --filter @purosur/pos pack:production --dir",
  ]) {
    const violations = violationsOf(workflow({ jobEnv: [], steps: [step(`run: ${run}`)] }));

    assert.equal(violations.length, 1, run);
  }
});

test("does not take a script whose name only starts like a packaging script for one", () => {
  const violations = violationsOf(
    workflow({
      jobEnv: [],
      steps: [step("run: pnpm --filter @purosur/pos pack:production-notes")],
    }),
  );

  assert.deepEqual(violations, []);
});

test("names the scripts that run electron-builder, directly or through another script", () => {
  const scripts = {
    build: "electron-vite build",
    "pack:production": "cross-env POS_CHANNEL=production electron-builder --win",
    "package:production": "electron-vite build && pnpm run pack:production",
    "package:all": "pnpm run package:production",
    test: "vitest run",
  };

  assert.deepEqual(packagingScriptNames({ scripts }).sort(), [
    "pack:production",
    "package:all",
    "package:production",
  ]);
});

test("reports each workflow's violations under its own path", () => {
  const files = {
    "a.yml": workflow({ steps: [cacheStep(CACHE_RESTORE), PACK, cacheStep(CACHE_SAVE)] }),
    "b.yml": workflow({
      jobEnv: [],
      steps: [cacheStep(CACHE_RESTORE), PACK, cacheStep(CACHE_SAVE)],
    }),
  };

  const violations = checkFiles(Object.keys(files), PACKAGING_SCRIPTS, (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "b.yml");
  assert.match(violations[0].message, /without ELECTRON_BUILDER_CACHE/);
});

test("reports a workflow that does not parse as YAML instead of scanning it silently", () => {
  const files = {
    "broken.yml": ["jobs:", "  build:", "    steps:", '      - run: "pack'].join("\n"),
  };

  const violations = checkFiles(Object.keys(files), PACKAGING_SCRIPTS, (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "broken.yml");
  assert.match(violations[0].message, /does not parse as YAML/);
});

test("every workflow that packages the register restores and saves electron-builder's downloads", () => {
  const packageJson = JSON.parse(readFileSync("apps/pos/package.json", "utf8"));

  const violations = checkFiles(findWorkflowFiles(), packagingScriptNames(packageJson));

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "electron-builder downloads its NSIS and signing tools from GitHub releases while packaging, " +
      "and a gateway time-out there fails the job; point ELECTRON_BUILDER_CACHE at a directory " +
      "the job restores before packaging and saves after it, as package-pos.yml does.",
  );
});
