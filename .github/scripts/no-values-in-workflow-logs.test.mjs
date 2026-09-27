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

const PRINTS = /prints an environment variable/;
const DUMPS = /dumps the whole environment/;
const TRACES = /traces the commands/;
const EMBEDS = /embeds a \$\{\{ \}\} expression/;

function assertFlagsOnly(messages, expected) {
  assert.equal(messages.length, 1, `expected one violation, got: ${JSON.stringify(messages)}`);
  assert.match(messages[0], expected);
}

test(`flags a run: step whose script embeds a \${{ secrets.* }} expression`, () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    `      - run: echo \${{ secrets.RAILWAY_TOKEN }}`,
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].line, 4);
  assert.match(violations[0].message, /\$\{\{ vars\.\* \}\}|secrets\.\*/);
});

test(`flags a run: step whose script embeds a \${{ vars.* }} expression`, () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    `      - run: echo \${{ vars.CLOUD_SENTRY_DSN }}`,
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test(`does not flag a \${{ steps.x.outputs.y }} expression inline in a run: script`, () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    `      - run: git checkout --detach "\${{ steps.target.outputs.sha }}"`,
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("flags a run: step that echoes an environment variable fed from secrets", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    `          RAILWAY_TOKEN: \${{ secrets.RAILWAY_TOKEN }}`,
    "        run: echo $RAILWAY_TOKEN",
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /prints an environment variable/);
});

test("flags a run: step that echoes a vars-fed variable in brace form", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    `          FEED_URL: \${{ vars.POS_UPDATE_FEED_URL }}`,
    `        run: echo "\${FEED_URL}"`,
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /prints an environment variable/);
});

test("flags a run: step that prints a secrets-fed variable with printf", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    `          TOKEN: \${{ secrets.TOKEN }}`,
    '        run: printf "%s" "$TOKEN"',
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("flags a run: step that prints a secrets-fed variable with printenv NAME", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    `          TOKEN: \${{ secrets.TOKEN }}`,
    "        run: printenv TOKEN",
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("does not flag echoing a secrets-fed variable redirected to $GITHUB_OUTPUT", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    `          TOKEN: \${{ secrets.TOKEN }}`,
    '        run: echo "value=$TOKEN" >> "$GITHUB_OUTPUT"',
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("does not flag echoing a secrets-fed variable piped into another command", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    `          TOKEN: \${{ secrets.TOKEN }}`,
    "        run: echo $TOKEN | wc -c",
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("does not flag registering a value for masking with ::add-mask::", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    `          TOKEN: \${{ secrets.TOKEN }}`,
    '        run: echo "::add-mask::$TOKEN"',
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("does not flag echoing an environment variable fed from github.* context", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    `          ACTOR: \${{ github.actor }}`,
    "        run: echo $ACTOR",
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("does not flag echoing an environment variable set to a plain literal", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    "          MODE: production",
    "        run: echo $MODE",
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("does not flag a step-level env overriding a job-level secrets-fed name with a literal", () => {
  const source = [
    "jobs:",
    "  build:",
    "    env:",
    `      TOKEN: \${{ secrets.TOKEN }}`,
    "    steps:",
    "      - env:",
    '          TOKEN: ""',
    "        run: echo $TOKEN",
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("flags a run: step that dumps the whole environment with a bare env", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: env"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /dumps the whole environment/);
});

test("flags a run: step that dumps the whole environment with a bare printenv", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: printenv"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /dumps the whole environment/);
});

test("flags a run: step that dumps the whole environment with a bare set", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: set"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /dumps the whole environment/);
});

test("flags a run: step that dumps the whole environment with export -p", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: export -p"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /dumps the whole environment/);
});

test("flags a run: step that dumps the whole environment with declare -p", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: declare -p"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("flags a run: step that dumps the whole environment with declare -x", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: declare -x"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("does not flag env used as a command prefix with a name", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: env FOO=bar node script.js",
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("does not flag declare -p redirected away from the log", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: declare -p > /tmp/vars.txt",
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("flags a run: step that traces its commands with set -x", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: set -x"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /traces the commands/);
});

test("does not flag set +x", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: set +x"].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("flags a run: step that traces its commands with set -o xtrace", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: set -o xtrace"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("does not flag set +o xtrace", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: set +o xtrace"].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("flags a run: step that traces its commands with combined flags like set -eux", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: set -eux"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("flags a run: step that traces its commands with set -euxo pipefail", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: set -euxo pipefail"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("flags a run: step invoking bash -x", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: bash -x script.sh"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("flags a run: step invoking sh -x", () => {
  const source = ["jobs:", "  build:", "    steps:", "      - run: sh -x script.sh"].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("flags a run: step whose shell: field passes -x", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - shell: bash -ex {0}",
    "        run: pnpm test",
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /traces the commands/);
});

test("flags a run: step under a job's defaults.run.shell that passes -x", () => {
  const source = [
    "jobs:",
    "  build:",
    "    defaults:",
    "      run:",
    "        shell: bash -x {0}",
    "    steps:",
    "      - run: pnpm test",
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
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

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("a step-level shell: overrides a job's defaults.run.shell", () => {
  const source = [
    "jobs:",
    "  build:",
    "    defaults:",
    "      run:",
    "        shell: bash -x {0}",
    "    steps:",
    "      - shell: bash {0}",
    "        run: pnpm test",
  ].join("\n");

  assert.deepEqual(findRunStepViolations(source), []);
});

test("resolves an aliased env: value that references secrets", () => {
  const source = [
    "x-env: &token-env",
    `  TOKEN: \${{ secrets.TOKEN }}`,
    "jobs:",
    "  build:",
    "    steps:",
    "      - env: *token-env",
    "        run: echo $TOKEN",
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 1);
});

test("resolves an aliased run: step", () => {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    "      - &leak",
    `        run: echo \${{ secrets.TOKEN }}`,
    "      - *leak",
  ].join("\n");

  const violations = findRunStepViolations(source);

  assert.equal(violations.length, 2);
});

const SECRET_ENV = { TOKEN: `\${{ secrets.TOKEN }}` };

function workflowWithStep(run, env = SECRET_ENV) {
  return [
    "jobs:",
    "  build:",
    "    steps:",
    "      - env:",
    ...Object.entries(env).map(([name, value]) => `          ${name}: ${value}`),
    `        run: ${JSON.stringify(run)}`,
  ].join("\n");
}

function messagesOf(run, env) {
  return findRunStepViolations(workflowWithStep(run, env)).map((violation) => violation.message);
}

for (const script of [
  'echo "token -> $TOKEN"',
  'echo "n>=1 $TOKEN"',
  'echo "$TOKEN" > "/dev/stderr"',
  "/bin/echo $TOKEN",
  "command echo $TOKEN",
  "builtin printf '%s' \"$TOKEN\"",
  'cat <<< "$TOKEN"',
  "echo a#b $TOKEN",
]) {
  test(`flags a step that prints a secrets-fed variable: ${script}`, () => {
    assertFlagsOnly(messagesOf(script), PRINTS);
  });
}

for (const script of ["export", "declare", "typeset", "env -0", "printenv -0", "command env"]) {
  test(`flags a step that dumps the whole environment: ${script}`, () => {
    assertFlagsOnly(messagesOf(script), DUMPS);
  });
}

for (const script of [
  'echo "$TOKEN" > "out.txt"',
  "echo ok # $TOKEN",
  'echo "::add-mask::$TOKEN"',
]) {
  test(`does not flag a step whose secrets-fed variable never reaches the log: ${script}`, () => {
    assert.deepEqual(messagesOf(script), []);
  });
}

test("reports the file and line of a step that embeds a secrets expression", () => {
  const files = {
    "a.yml": ["jobs:", "  build:", "    steps:", `      - run: echo \${{ secrets.TOKEN }}`].join(
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
    message: "run: step dumps the whole environment",
  });

  assert.equal(description, "a.yml:2: run: step dumps the whole environment");
});

test("every run: step in every workflow in this repository avoids printing vars/secrets or tracing", () => {
  const files = findWorkflowFiles();
  assert.ok(files.length > 0, "expected to find at least one workflow file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    `GitHub prints a step's own run: script (with its \${{ }} expressions already substituted) ` +
      "to the step's log; a step must not embed a vars.*/secrets.* expression, print an " +
      "environment variable fed from one, dump the whole environment, or trace the commands it runs.",
  );
});
