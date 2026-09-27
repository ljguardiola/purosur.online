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

for (const [script, expected] of [
  ['if [ -n "$D" ]; then set -x; fi', TRACES],
  ['if true; then echo "$TOKEN"; fi', PRINTS],
  ["for i in 1; do echo $TOKEN; done", PRINTS],
  ["while true; do printenv; done", DUMPS],
  ["if false; then :; else echo $TOKEN; fi", PRINTS],
  ["{ set -x; }", TRACES],
  ["(set -x)", TRACES],
  ["! echo $TOKEN", PRINTS],
  ["time echo $TOKEN", PRINTS],
  ['case "$MODE" in prod) echo "$TOKEN";; esac', PRINTS],
  ['  prod) echo "$TOKEN" ;;', PRINTS],
  ["prod | staging ) printenv ;;", DUMPS],
  ["(prod) set -x;;", TRACES],
  ["f() { set -x; }", TRACES],
  ["f () { echo $TOKEN; }", PRINTS],
  ["function f { printenv; }", DUMPS],
  ["function f() { set -x; }", TRACES],
  ["(env)", DUMPS],
]) {
  test(`sees a command inside a compound statement: ${script}`, () => {
    assertFlagsOnly(messagesOf(script), expected);
  });
}

for (const [script, expected] of [
  ["env | sort", DUMPS],
  ["printenv | grep -v PATH", DUMPS],
  ["set | head", DUMPS],
  ['echo "$TOKEN" | tee out.txt', PRINTS],
  ['echo "$TOKEN" | base64', PRINTS],
  ['echo "$TOKEN" | tr a-z A-Z | rev', PRINTS],
  ['cat <<< "$TOKEN" | xxd', PRINTS],
  ["env | grep -E '^CI='", DUMPS],
  ['echo "$TOKEN" | grep -o x', PRINTS],
  ['grep -i x <<< "$TOKEN"', PRINTS],
]) {
  test(`flags a pipeline whose later stages pass the value through to the log: ${script}`, () => {
    assertFlagsOnly(messagesOf(script), expected);
  });
}

for (const script of [
  'echo "$TOKEN" | docker login ghcr.io -u me --password-stdin',
  'echo "$CERT" | base64 -d > cert.pem',
  'echo "$TOKEN" | base64 | tee out.txt > /dev/null',
  "env | sort > env.txt",
  "if echo \"$TOKEN\" | grep -q '^ghp_'; then echo ok; fi",
  "env | grep -q '^CI='",
  "printenv | grep -c PATH",
  'echo "$TOKEN" | grep -l x',
  'echo "$TOKEN" | grep -L x',
  'echo "$TOKEN" | grep -Eiq x',
  'echo "$TOKEN" | grep --quiet x',
  'echo "$TOKEN" | grep --silent x',
  'echo "$TOKEN" | grep --count x',
  "env | grep --files-with-matches x",
  "grep -q x <<< \"$TOKEN\"",
]) {
  test(`does not flag a pipeline that consumes the value or sends it away from the log: ${script}`, () => {
    assert.deepEqual(messagesOf(script, { ...SECRET_ENV, CERT: `\${{ secrets.CERT }}` }), []);
  });
}

function messagesUnderShell(shell) {
  const source = [
    "jobs:",
    "  build:",
    "    steps:",
    `      - shell: ${shell}`,
    "        run: pnpm test",
  ];
  return findRunStepViolations(source.join("\n")).map((violation) => violation.message);
}

for (const script of [
  "set -e -x",
  "set -eu -x",
  "set -o errexit -o xtrace",
  "set -eo xtrace",
  "bash -o xtrace deploy.sh",
  "bash -c 'set -x; ./deploy.sh'",
  "bash -x deploy.sh | tee out.log",
  "bash -x deploy.sh > out.log",
]) {
  test(`flags a step that turns on command tracing: ${script}`, () => {
    assertFlagsOnly(messagesOf(script), TRACES);
  });
}

test("reads a shell's -c command string as a script of its own", () => {
  assertFlagsOnly(messagesOf("bash -c 'echo $TOKEN'"), PRINTS);
});

for (const script of [
  "bash scripts/build.sh -x",
  "bash ./tool.sh --dry -x",
  'sh -c "grep -x main f"',
  "set +x",
  "set -o errexit +o xtrace",
  "bash --noprofile --norc -eo pipefail deploy.sh",
]) {
  test(`does not flag a step that leaves command tracing off: ${script}`, () => {
    assert.deepEqual(messagesOf(script), []);
  });
}

test("flags a shell: field that turns on tracing with -o xtrace", () => {
  assertFlagsOnly(messagesUnderShell("bash -o xtrace {0}"), TRACES);
});

test("does not flag a shell: field whose script operand is followed by -x", () => {
  assert.deepEqual(messagesUnderShell("bash {0} -x"), []);
});

for (const expression of [
  "toJSON(vars)",
  "vars['CLOUD_SENTRY_DSN']",
  "secrets['RAILWAY_TOKEN']",
  "format('{0}', vars.CLOUD_SENTRY_DSN)",
  "env.TOKEN",
  "env['TOKEN']",
  "format('it''s {0}', secrets.X)",
  "format('{0}', env['TOKEN'])",
]) {
  test(`flags a run: script embedding an expression that reads vars or secrets: \${{ ${expression} }}`, () => {
    assertFlagsOnly(messagesOf(`echo \${{ ${expression} }}`), EMBEDS);
  });
}

for (const expression of [
  "github.event.vars_thing",
  "steps.secrets.outputs.sha",
  "contains(github.ref, 'secrets')",
  "env.MODE",
  "hashFiles('config/secrets.json')",
  "contains(github.event.head_commit.message, 'rotate secrets')",
  "format('{0} vars', github.actor)",
  "contains(github.ref, 'it''s secrets and vars')",
  "format('env {0}', github.actor)",
  "format('{0}', 'env.TOKEN')",
]) {
  test(`does not flag a run: script embedding an expression that reads neither: \${{ ${expression} }}`, () => {
    assert.deepEqual(
      messagesOf(`echo \${{ ${expression} }}`, { ...SECRET_ENV, MODE: "production" }),
      [],
    );
  });
}

for (const expression of ["toJSON(secrets)", "vars['X']", "format('{0}', secrets.X)"]) {
  test(`treats an env value fed by \${{ ${expression} }} as coming from vars or secrets`, () => {
    assertFlagsOnly(messagesOf("echo $FED", { FED: `\${{ ${expression} }}` }), PRINTS);
  });
}

function messagesWithScopedEnv(run, { workflowEnv = {}, jobEnv = {}, stepEnv = {} }) {
  const envLines = (env, indent) =>
    Object.entries(env).map(([name, value]) => `${indent}${name}: ${value}`);
  const source = [
    ...(Object.keys(workflowEnv).length > 0 ? ["env:", ...envLines(workflowEnv, "  ")] : []),
    "jobs:",
    "  build:",
    ...(Object.keys(jobEnv).length > 0 ? ["    env:", ...envLines(jobEnv, "      ")] : []),
    "    steps:",
    ...(Object.keys(stepEnv).length > 0
      ? ["      - env:", ...envLines(stepEnv, "          "), `        run: ${JSON.stringify(run)}`]
      : [`      - run: ${JSON.stringify(run)}`]),
  ];
  return findRunStepViolations(source.join("\n")).map((violation) => violation.message);
}

for (const [description, scopes] of [
  [
    "a step env value reading a job env value fed from secrets",
    { jobEnv: SECRET_ENV, stepEnv: { FED: `\${{ env.TOKEN }}` } },
  ],
  [
    "a job env value reading a workflow env value fed from secrets",
    { workflowEnv: SECRET_ENV, jobEnv: { FED: `\${{ env['TOKEN'] }}` } },
  ],
  [
    "a step env value reading a job env value through a job env value",
    {
      workflowEnv: SECRET_ENV,
      jobEnv: { MIDDLE: `\${{ env.TOKEN }}` },
      stepEnv: { FED: `\${{ format('x{0}', env.MIDDLE) }}` },
    },
  ],
  [
    "a step env value reading the job value of a name the step overrides",
    { jobEnv: SECRET_ENV, stepEnv: { TOKEN: "literal", FED: `\${{ env.TOKEN }}` } },
  ],
]) {
  test(`treats an env value fed from a tainted env value as tainted: ${description}`, () => {
    assertFlagsOnly(messagesWithScopedEnv("echo $FED", scopes), PRINTS);
  });
}

for (const [description, scopes] of [
  [
    "a step env value reading a job env literal",
    { jobEnv: { MODE: "production" }, stepEnv: { FED: `\${{ env.MODE }}` } },
  ],
  [
    "a step env value reading a sibling in the same step env, which the step cannot see",
    { stepEnv: { ...SECRET_ENV, FED: `\${{ env.TOKEN }}` } },
  ],
]) {
  test(`does not treat an env value as tainted: ${description}`, () => {
    assert.deepEqual(messagesWithScopedEnv("echo $FED", scopes), []);
  });
}

for (const expression of ["toJSON(env)", "join(env.*, ',')", "env"]) {
  test(`flags a run: script reading the whole env context while a tainted name is in scope: \${{ ${expression} }}`, () => {
    assertFlagsOnly(
      messagesWithScopedEnv(`echo \${{ ${expression} }}`, { jobEnv: SECRET_ENV }),
      EMBEDS,
    );
  });

  test(`does not flag a run: script reading the whole env context with no tainted name in scope: \${{ ${expression} }}`, () => {
    assert.deepEqual(
      messagesWithScopedEnv(`echo \${{ ${expression} }}`, { jobEnv: { MODE: "production" } }),
      [],
    );
  });
}

test("does not treat an env value fed by a step output named secrets as coming from secrets", () => {
  assert.deepEqual(messagesOf("echo $FED", { FED: `\${{ steps.secrets.outputs.sha }}` }), []);
});

function messagesOfJobStep(
  run,
  { runsOn = "windows-latest", stepShell, jobShell, workflowShell } = {},
) {
  const source = [
    ...(workflowShell ? ["defaults:", "  run:", `    shell: ${workflowShell}`] : []),
    "jobs:",
    "  build:",
    `    runs-on: ${runsOn}`,
    ...(jobShell ? ["    defaults:", "      run:", `        shell: ${jobShell}`] : []),
    "    steps:",
    "      - env:",
    `          TOKEN: \${{ secrets.TOKEN }}`,
    ...(stepShell ? [`        shell: ${stepShell}`] : []),
    `        run: ${JSON.stringify(run)}`,
  ];
  return findRunStepViolations(source.join("\n")).map((violation) => violation.message);
}

for (const [script, expected] of [
  ["echo $env:TOKEN", PRINTS],
  [`Write-Host "token: \${env:TOKEN}"`, PRINTS],
  ["write-output $ENV:token", PRINTS],
  ["Write-Information $env:TOKEN", PRINTS],
  ["$env:TOKEN", PRINTS],
  ['"value: $env:TOKEN"', PRINTS],
  ["Write-Output $env:TOKEN | Sort-Object", PRINTS],
  ["Write-Host $env:TOKEN > out.txt", PRINTS],
  ["Write-Host $env:TOKEN | Out-File out.txt", PRINTS],
  ["Get-ChildItem env:", DUMPS],
  ["gci env:", DUMPS],
  ["dir Env:\\", DUMPS],
  ["ls env: | Sort-Object Name", DUMPS],
  ["Set-PSDebug -Trace 1", TRACES],
  ["set-psdebug -trace 2", TRACES],
  ["Write-Warning $env:TOKEN", PRINTS],
  ["Write-Error $env:TOKEN", PRINTS],
  ["Write-Warning $env:TOKEN > out.txt", PRINTS],
  ["Write-Error $env:TOKEN | Out-Null", PRINTS],
  ["$env:TOKEN | Write-Host", PRINTS],
  ['"$env:TOKEN" | Write-Output', PRINTS],
  ["$env:TOKEN | Sort-Object | Write-Host > out.txt", PRINTS],
  ["Get-ChildItem env:TOKEN", PRINTS],
  ["Get-Item env:TOKEN", PRINTS],
  ["Get-Content env:TOKEN", PRINTS],
  ["(Get-Item env:TOKEN).Value", PRINTS],
  ["Write-Host (Get-Item env:TOKEN).Value", PRINTS],
  ["gci Env:TOKEN", PRINTS],
  ["gi env:token", PRINTS],
  ["gc ENV:TOKEN", PRINTS],
  ["dir env:\\TOKEN", PRINTS],
  ["ls env:TOKEN | Format-List", PRINTS],
]) {
  test(`flags a PowerShell step on a Windows runner: ${script}`, () => {
    assertFlagsOnly(messagesOfJobStep(script), expected);
  });
}

for (const script of [
  "echo $env:TOKEN > out.txt",
  "Write-Output $env:TOKEN >> $env:GITHUB_OUTPUT",
  "Write-Output $env:TOKEN | Out-File out.txt",
  "echo $env:TOKEN | Set-Content out.txt",
  "echo $env:TOKEN | Add-Content out.txt",
  "Write-Output $env:TOKEN | Out-Null",
  "$env:TOKEN | docker login ghcr.io -u me --password-stdin",
  'echo "::add-mask::$env:TOKEN"',
  'Write-Host "$env:TOKEN" *> $null',
  "Get-ChildItem env: | Out-File env.txt",
  "Set-PSDebug -Trace 0",
  "$env:TOKEN = 'rotated'",
  "echo $TOKEN",
  "set -x",
  "Write-Warning $env:TOKEN 3> $null",
  "Write-Error $env:TOKEN 2> err.txt",
  "Write-Warning $env:TOKEN *> $null",
  "$env:TOKEN | Write-Host 6> $null",
  "$env:TOKEN | Write-Output > out.txt",
  "Get-Content env:TOKEN > out.txt",
  "Get-Item env:TOKEN | Out-Null",
  "$value = (Get-Item env:TOKEN).Value",
  "Remove-Item env:TOKEN",
  "Get-Item env:TOKENS",
]) {
  test(`does not flag a PowerShell step on a Windows runner: ${script}`, () => {
    assert.deepEqual(messagesOfJobStep(script), []);
  });
}

test("a step's shell: bash on a Windows runner reads its script as bash", () => {
  assertFlagsOnly(messagesOfJobStep("echo $TOKEN", { stepShell: "bash" }), PRINTS);
  assert.deepEqual(messagesOfJobStep("echo $env:TOKEN", { stepShell: "bash" }), []);
});

for (const options of [
  { runsOn: "ubuntu-24.04", stepShell: "pwsh" },
  { runsOn: "ubuntu-24.04", stepShell: "powershell" },
  { runsOn: "ubuntu-24.04", jobShell: "pwsh" },
  { runsOn: "ubuntu-24.04", workflowShell: "pwsh" },
  { runsOn: "[self-hosted, windows]" },
]) {
  test(`reads the script as PowerShell when the effective shell is: ${JSON.stringify(options)}`, () => {
    assertFlagsOnly(messagesOfJobStep("echo $env:TOKEN", options), PRINTS);
    assert.deepEqual(messagesOfJobStep("echo $TOKEN", options), []);
  });
}

test("reads the script as bash on a runner that is not Windows", () => {
  assertFlagsOnly(messagesOfJobStep("echo $TOKEN", { runsOn: "ubuntu-24.04" }), PRINTS);
});

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
