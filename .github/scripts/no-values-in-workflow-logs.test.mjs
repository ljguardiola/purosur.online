import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findRunStepViolations,
  findWorkflowFiles,
} from "./no-values-in-workflow-logs.mjs";

const EMBEDS = /embeds a \$\{\{ \}\} expression/;
const TRACES = /traces the commands/;

function assertFlagsOnly(messages, expected) {
  assert.equal(messages.length, 1, `expected one violation, got: ${JSON.stringify(messages)}`);
  assert.match(messages[0], expected);
}

function messagesOf(run, env) {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    ...(env
      ? ["      - env:", ...Object.entries(env).map(([k, v]) => `          ${k}: ${v}`)]
      : ["      -"]),
    `        run: ${JSON.stringify(run)}`,
  ].join("\n");
  return findRunStepViolations(source).map((violation) => violation.message);
}

for (const expression of ["vars.CLOUD_SENTRY_DSN", "secrets.RAILWAY_TOKEN"]) {
  test(`flags a run: step whose script embeds a \${{ ${expression} }} expression`, () => {
    assertFlagsOnly(messagesOf(`echo \${{ ${expression} }}`), EMBEDS);
  });
}

for (const expression of ["toJSON(vars)", "vars['CLOUD_SENTRY_DSN']", "secrets['RAILWAY_TOKEN']"]) {
  test(`flags every form of a vars/secrets expression: \${{ ${expression} }}`, () => {
    assertFlagsOnly(messagesOf(`echo \${{ ${expression} }}`), EMBEDS);
  });
}

for (const expression of ["steps.secrets.outputs.sha", "github.event.vars_thing"]) {
  test(`does not flag another context's member that merely contains vars/secrets: \${{ ${expression} }}`, () => {
    assert.deepEqual(messagesOf(`echo \${{ ${expression} }}`), []);
  });
}

test("does not flag a single-quoted string literal that mentions secrets", () => {
  assert.deepEqual(messagesOf(`echo \${{ hashFiles('config/secrets.json') }}`), []);
});

test("flags a step-level env: value read back through env.NAME when it is fed from secrets", () => {
  assertFlagsOnly(messagesOf(`echo \${{ env.TOKEN }}`, { TOKEN: "${{ secrets.TOKEN }}" }), EMBEDS);
});

test("flags a job-level env: value read back through env['NAME'] when it is fed from vars", () => {
  const source = [
    "jobs:",
    "  build:",
    "    env:",
    "      FEED_URL: ${{ vars.POS_UPDATE_FEED_URL }}",
    "    steps:",
    "      - run: echo ${{ env['FEED_URL'] }}",
  ].join("\n");

  assertFlagsOnly(
    findRunStepViolations(source).map((v) => v.message),
    EMBEDS,
  );
});

test("flags a workflow-level env: value read back through env.NAME when it is fed from secrets", () => {
  const source = [
    "env:",
    "  TOKEN: ${{ secrets.TOKEN }}",
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: echo ${{ env.TOKEN }}",
  ].join("\n");

  assertFlagsOnly(
    findRunStepViolations(source).map((v) => v.message),
    EMBEDS,
  );
});

test("does not flag env.NAME when NAME is set to a plain literal", () => {
  assert.deepEqual(messagesOf(`echo \${{ env.MODE }}`, { MODE: "production" }), []);
});

for (const script of ["set -x", "set -eux", "set -euxo pipefail", "set -o xtrace"]) {
  test(`flags a run: step that traces its commands: ${script}`, () => {
    assertFlagsOnly(messagesOf(script), TRACES);
  });
}

test("does not flag set +x", () => {
  assert.deepEqual(messagesOf("set +x"), []);
});

for (const script of ["bash -ex script.sh", "bash -o xtrace deploy.sh", "sh -x script.sh"]) {
  test(`flags a run: step invoking a shell with a tracing option right after it: ${script}`, () => {
    assertFlagsOnly(messagesOf(script), TRACES);
  });
}

test("does not flag a shell option that follows the script operand instead of the shell word", () => {
  assert.deepEqual(messagesOf("bash script.sh -x"), []);
});

for (const script of ["Set-PSDebug -Trace 1", "set-psdebug -trace 2"]) {
  test(`flags Set-PSDebug tracing case-insensitively: ${script}`, () => {
    assertFlagsOnly(messagesOf(script), TRACES);
  });
}

test("does not flag Set-PSDebug -Trace 0", () => {
  assert.deepEqual(messagesOf("Set-PSDebug -Trace 0"), []);
});

test("flags a run: step whose own shell: field passes -x", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - shell: bash -ex {0}",
    "        run: pnpm test",
  ].join("\n");

  assertFlagsOnly(
    findRunStepViolations(source).map((v) => v.message),
    TRACES,
  );
});

test("flags a run: step under a job's defaults.run.shell that passes -o xtrace", () => {
  const source = [
    "jobs:",
    "  build:",
    "    defaults:",
    "      run:",
    "        shell: bash -o xtrace {0}",
    "    steps:",
    "      - run: pnpm test",
  ].join("\n");

  assertFlagsOnly(
    findRunStepViolations(source).map((v) => v.message),
    TRACES,
  );
});

test("flags a run: step under a workflow's defaults.run.shell that passes -x", () => {
  const source = [
    "defaults:",
    "  run:",
    "    shell: bash -x {0}",
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: pnpm test",
  ].join("\n");

  assertFlagsOnly(
    findRunStepViolations(source).map((v) => v.message),
    TRACES,
  );
});

test("does not flag a shell: field whose script operand is followed by -x", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - shell: bash {0} -x",
    "        run: pnpm test",
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("resolves an aliased env: value that references secrets", () => {
  const source = [
    "x-env: &token-env",
    "  TOKEN: ${{ secrets.TOKEN }}",
    "jobs:",
    "  build:",
    "    steps:",
    "      - env: *token-env",
    "        run: echo ${{ env.TOKEN }}",
  ].join("\n");

  assertFlagsOnly(
    findRunStepViolations(source).map((v) => v.message),
    EMBEDS,
  );
});

test("resolves an aliased run: step", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - &leak",
    "        run: echo ${{ secrets.TOKEN }}",
    "      - *leak",
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 2);
});

test("reports the file and line of a step that embeds a secrets expression", () => {
  const files = {
    "a.yml": ["jobs:", "  build:", "    steps:", "      - run: echo ${{ secrets.TOKEN }}"].join(
      "\n",
    ),
    "b.yml": ["jobs:", "  build:", "    steps:", "      - run: echo hi"].join("\n"),
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "a.yml");
  assert.equal(violations[0].line, 4);
});

test("reports a workflow that does not parse as YAML instead of scanning it silently", () => {
  const files = {
    "broken.yml": ["jobs:", "  build:", "    steps:", '      - run: "echo unterminated'].join("\n"),
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "broken.yml");
  assert.match(violations[0].message, /does not parse as YAML/);
});

test("findWorkflowFiles also finds a .yaml workflow file", () => {
  const root = mkdtempSync(join(tmpdir(), "no-values-in-workflow-logs-"));
  try {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "a.yml"), "jobs: {}\n");
    writeFileSync(join(root, ".github", "workflows", "b.yaml"), "jobs: {}\n");

    const files = findWorkflowFiles(root);

    assert.deepEqual(files, [
      join(".github", "workflows", "a.yml"),
      join(".github", "workflows", "b.yaml"),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("describes a violation with its file, line and message", () => {
  const description = describeViolation({
    path: "a.yml",
    line: 2,
    message: "run: step traces the commands it runs",
  });

  assert.equal(description, "a.yml:2: run: step traces the commands it runs");
});

test("every run: step in every workflow in this repository avoids embedding vars/secrets or tracing", () => {
  const files = findWorkflowFiles();
  assert.ok(files.length > 0, "expected to find at least one workflow file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "GitHub substitutes a ${{ }} expression before printing the step's run: script to its log; " +
      "pass a vars.*/secrets.* value through the step's env: instead of embedding it, and never " +
      "trace the commands a step runs.",
  );
});
