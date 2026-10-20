import assert from "node:assert/strict";
import { matchesGlob } from "node:path";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findWorkflowFiles,
} from "./node-scripts-run-after-install.mjs";

const WORKFLOW = ".github/workflows/a.yml";

function inMemoryRepository(files) {
  return {
    read: (path) => files[path],
    glob: (pattern) =>
      Object.keys(files)
        .filter((path) => matchesGlob(path, pattern))
        .sort(),
  };
}

function check(workflowLines, files = {}) {
  return checkFiles(
    [WORKFLOW],
    inMemoryRepository({ [WORKFLOW]: workflowLines.join("\n"), ...files }),
  );
}

function job(...steps) {
  return ["jobs:", "  build:", "    steps:", ...steps.flat()];
}

const install = "      - run: pnpm install --frozen-lockfile";
const importsYaml = { "s/main.mjs": 'import { parse } from "yaml";\n' };

test("accepts a script that imports only Node built-ins, prefixed or not", () => {
  const files = {
    "s/main.mjs": [
      'import { readFileSync } from "node:fs";',
      'import { appendFile } from "fs/promises";',
      'import { test } from "node:test";',
      'import path from "path";',
    ].join("\n"),
  };

  assert.deepEqual(check(job("      - run: node s/main.mjs"), files), []);
});

test("refuses a script importing a package with no install in the job", () => {
  const violations = check(job("      - name: Plan", "        run: node s/main.mjs"), importsYaml);

  assert.deepEqual(violations, [
    {
      path: WORKFLOW,
      line: 4,
      message:
        'step "Plan" of job build runs s/main.mjs, which imports package yaml ' +
        "with no dependency installation in an earlier step of the job",
    },
  ]);
});

test("accepts a script importing a package after an install in an earlier step", () => {
  assert.deepEqual(check(job(install, "      - run: node s/main.mjs"), importsYaml), []);
});

test("counts an install with any options, and its short form", () => {
  for (const command of [
    "pnpm install",
    "pnpm install --frozen-lockfile --ignore-scripts",
    "pnpm install --frozen-lockfile --filter a --filter @b/c",
    "pnpm i --frozen-lockfile",
    "pnpm --filter a install",
    "pnpm -F a --filter-prod @b/c i --frozen-lockfile",
    "pnpm --filter=a --dir . install",
    "pnpm --reporter append-only --loglevel warn install",
  ]) {
    assert.deepEqual(
      check(job(`      - run: ${command}`, "      - run: node s/main.mjs"), importsYaml),
      [],
      command,
    );
  }
});

test("refuses a script run before the install of the same job", () => {
  assert.equal(check(job("      - run: node s/main.mjs", install), importsYaml).length, 1);
});

test("refuses a script whose only install ran in another job", () => {
  const workflow = [
    "jobs:",
    "  setup:",
    "    steps:",
    install,
    "  build:",
    "    needs: [setup]",
    "    steps:",
    "      - run: node s/main.mjs",
  ];

  assert.equal(check(workflow, importsYaml).length, 1);
});

test("counts an install earlier in the same step's script, but not one after the script", () => {
  assert.deepEqual(
    check(
      job("      - run: |", "          pnpm install", "          node s/main.mjs"),
      importsYaml,
    ),
    [],
  );
  assert.equal(
    check(job("      - run: |", "          node s/main.mjs", "          pnpm install"), importsYaml)
      .length,
    1,
  );
});

test("does not count an install run in a directory outside the repository", () => {
  const steps = [
    "      - run: pnpm install",
    `        working-directory: \${{ runner.temp }}/previous`,
    "      - run: node s/main.mjs",
  ];

  assert.equal(check(job(steps), importsYaml).length, 1);
});

test("does not count an install whose directory option points outside the repository", () => {
  for (const command of [
    "pnpm -C ../previous install",
    "pnpm --filter a --dir ../previous install",
    "pnpm --dir=../previous -F a i",
  ]) {
    assert.equal(
      check(job(`      - run: ${command}`, "      - run: node s/main.mjs"), importsYaml).length,
      1,
      command,
    );
  }
});

test("names the package reached through a chain of local imports, and the module importing it", () => {
  const files = {
    "s/main.mjs": 'import { a } from "./lib/a.mjs";\n',
    "s/lib/a.mjs": 'import { b } from "../b.mjs";\nexport const a = b;\n',
    "s/b.mjs": 'import { AwsClient } from "aws4fetch";\nexport const b = AwsClient;\n',
  };

  const [violation] = check(job("      - name: Sign", "        run: node s/main.mjs"), files);

  assert.equal(
    violation.message,
    'step "Sign" of job build runs s/main.mjs, which imports package aws4fetch ' +
      "through s/b.mjs with no dependency installation in an earlier step of the job",
  );
});

test("follows re-exports to the package they re-export", () => {
  for (const source of [
    'export { parse } from "yaml";',
    'export * from "yaml";',
    'export * as yaml from "yaml";',
  ]) {
    const files = { "s/main.mjs": 'import "./re.mjs";\n', "s/re.mjs": source };

    const violations = check(job("      - run: node s/main.mjs"), files);

    assert.equal(violations.length, 1, source);
    assert.match(violations[0].message, /package yaml through s\/re\.mjs/, source);
  }
});

test("a renamed, namespace, default or side-effect import does not hide the package", () => {
  for (const source of [
    'import { parse as readYaml } from "yaml";',
    'import * as yaml from "yaml";',
    'import yaml from "yaml";',
    'import "yaml";',
    'import yaml, { parse } from "yaml";',
  ]) {
    assert.equal(
      check(job("      - run: node s/main.mjs"), { "s/main.mjs": source }).length,
      1,
      source,
    );
  }
});

test("follows a dynamic import with a literal path, local or a package", () => {
  const files = {
    "s/main.mjs": 'const { run } = await import("./later.mjs");\n',
    "s/later.mjs": "export const run = () => import(`zod`);\n",
  };

  const [violation] = check(job("      - run: node s/main.mjs"), files);

  assert.match(violation.message, /package zod through s\/later\.mjs/);
});

test("follows require() with a literal path", () => {
  const files = {
    "s/main.mjs": [
      'import { createRequire } from "node:module";',
      "const require = createRequire(import.meta.url);",
      'const lint = require("@secretlint/node");',
    ].join("\n"),
  };

  assert.match(
    check(job("      - run: node s/main.mjs"), files)[0].message,
    /package @secretlint\/node /,
  );
});

test("names a scoped or subpath import by its package", () => {
  const files = {
    "s/main.mjs": 'import { a } from "@scope/pkg/sub/path";\nimport { b } from "yaml/util";\n',
  };

  assert.match(
    check(job("      - run: node s/main.mjs"), files)[0].message,
    /package @scope\/pkg /,
  );
});

test("names the first package the script imports, in import order", () => {
  const files = {
    "s/main.mjs": 'import "./first.mjs";\nimport "zod";\n',
    "s/first.mjs": 'import "yaml";\n',
  };

  assert.match(check(job("      - run: node s/main.mjs"), files)[0].message, /package yaml /);
});

test("does not count a type-only import or export of a TypeScript script, which Node erases", () => {
  const files = {
    "s/main.ts": [
      'import type { A } from "yaml";',
      'export type { B } from "zod";',
      'import { readFileSync } from "node:fs";',
    ].join("\n"),
  };

  assert.deepEqual(check(job("      - run: node s/main.ts"), files), []);
});

test("counts an import whose names are all marked type inline, which Node keeps", () => {
  const files = { "s/main.ts": 'import { type A } from "yaml";\n' };

  assert.equal(check(job("      - run: node s/main.ts"), files).length, 1);
});

test("terminates on local modules that import each other", () => {
  const files = {
    "s/main.mjs": 'import "./a.mjs";\n',
    "s/a.mjs": 'import "./main.mjs";\nimport "yaml";\n',
  };

  assert.equal(check(job("      - run: node s/main.mjs"), files).length, 1);
});

test("follows every file run as node --test, including globs and flags before them", () => {
  const files = {
    "s/ok.test.mjs": 'import "node:test";\n',
    "s/bad.test.mjs": 'import "yaml";\n',
  };

  for (const command of [
    "node --test s/ok.test.mjs s/bad.test.mjs",
    "node --test s/*.test.mjs",
    "node --test --test-reporter spec --test-shard=1/2 s/ok.test.mjs s/bad.test.mjs",
    "node --test --test-name-pattern 'a b' s/bad.test.mjs",
  ]) {
    const violations = check(job(`      - run: ${command}`), files);

    assert.equal(violations.length, 1, command);
    assert.match(violations[0].message, /runs s\/bad\.test\.mjs, which imports package yaml/);
  }
});

test("follows the files node --test finds by itself when given none", () => {
  const files = {
    "s/bad.test.mjs": 'import "yaml";\n',
    "node_modules/x/dep.test.mjs": 'import "zod";\n',
  };

  const violations = check(job("      - run: node --test"), files);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /runs s\/bad\.test\.mjs/);
});

test("follows a script whose path comes after other node flags", () => {
  for (const command of [
    "node --experimental-strip-types s/main.mjs",
    "node --max-old-space-size=4096 --no-warnings s/main.mjs",
    "node --disable-warning ExperimentalWarning s/main.mjs arg",
  ]) {
    const violations = check(job(`      - run: ${command}`), importsYaml);

    assert.equal(violations.length, 1, command);
    assert.match(violations[0].message, /runs s\/main\.mjs, which imports package yaml/, command);
  }
});

test("follows modules preloaded with --import or --require", () => {
  const files = { "s/main.mjs": 'import "node:fs";\n', "s/hook.mjs": 'import "zod";\n' };

  for (const command of [
    "node --import ./s/hook.mjs s/main.mjs",
    "node --import=yaml s/main.mjs",
    "node -r ./s/hook.mjs s/main.mjs",
  ]) {
    assert.equal(check(job(`      - run: ${command}`), files).length, 1, command);
  }
});

test("follows the imports of code given to node -e", () => {
  const violations = check(job(`      - run: node -e 'import("./s/main.mjs")'`), importsYaml);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /through s\/main\.mjs/);
});

test("finds node wherever a shell command starts, and nowhere else", () => {
  for (const script of [
    "files=$(node s/main.mjs)",
    "echo start && node s/main.mjs",
    "true; node s/main.mjs | tee out.txt",
    "SOME_VAR=1 OTHER=2 node s/main.mjs",
    "if node s/main.mjs; then echo ok; fi",
    'node s/main.mjs > "$RUNNER_TEMP/out.json" 2>&1',
    "diff <(node s/main.mjs) expected.txt",
    "echo a | tee >(node s/main.mjs) > /dev/null",
  ]) {
    assert.equal(
      check(job(`      - run: ${JSON.stringify(script)}`), importsYaml).length,
      1,
      script,
    );
  }

  assert.deepEqual(
    check(
      job("      - run: pnpm exec vitest run --project node && echo node s/main.mjs"),
      importsYaml,
    ),
    [],
  );
});

test("reads a folded or continued script as one command", () => {
  const folded = job("      - run: >-", "          node", "          s/main.mjs", "          arg");
  const continued = job("      - run: |", "          node \\", "            s/main.mjs");

  assert.equal(check(folded, importsYaml).length, 1);
  assert.equal(check(continued, importsYaml).length, 1);
});

test("reads the commands after a here-document, whatever its body holds", () => {
  for (const lines of [
    ["cat <<EOF", "it's here", "EOF", "node s/main.mjs"],
    ["cat <<'EOF' > out.txt", "it's here", "EOF", "node s/main.mjs"],
    ['cat <<"END"', "it's here", "END", "node s/main.mjs"],
    ["cat <<-EOF", "\tit's here", "\tEOF", "node s/main.mjs"],
    ["cat <<A <<B", "it's", "A", "it's", "B", "node s/main.mjs"],
  ]) {
    const workflow = job("      - run: |", ...lines.map((line) => `          ${line}`));

    assert.equal(check(workflow, importsYaml).length, 1, lines.join("\n"));
  }
});

test("reads a here-string as a word of its command", () => {
  const workflow = job("      - run: |", `          cat <<< "it's"`, "          node s/main.mjs");

  assert.equal(check(workflow, importsYaml).length, 1);
});

test("reads a shift inside arithmetic as arithmetic, not as a here-document", () => {
  for (const lines of [
    ["(( mask = 1 << 2 ))", "node s/main.mjs"],
    ["if (( 1 << 2 )); then echo; fi", "node s/main.mjs"],
    ["for (( i = 0; i < 2; i++ )); do echo; done", "node s/main.mjs"],
    ["x=$(( 1 << 2 ))", "node s/main.mjs"],
  ]) {
    const workflow = job("      - run: |", ...lines.map((line) => `          ${line}`));

    assert.equal(check(workflow, importsYaml).length, 1, lines.join("\n"));
  }
});

test("finds node in a command substitution inside arithmetic", () => {
  assert.equal(check(job("      - run: (( $(node s/main.mjs) > 0 ))"), importsYaml).length, 1);
});

test("finds node in a backtick substitution inside arithmetic", () => {
  assert.equal(check(job("      - run: (( `node s/main.mjs` > 0 ))"), importsYaml).length, 1);
});

test("finds node in nested subshells that open with two parentheses", () => {
  for (const run of ["((node s/main.mjs) || true)", "((node s/main.mjs; true) 2>&1) | tee log"]) {
    assert.equal(check(job(`      - run: ${run}`), importsYaml).length, 1, run);
  }
});

test("reads a here-document inside nested subshells that open with two parentheses", () => {
  const lines = ["((cat <<EOF) | tee out)", "don't", "EOF", "node s/main.mjs"];
  const workflow = job("      - run: |", ...lines.map((line) => `          ${line}`));

  assert.equal(check(workflow, importsYaml).length, 1);
});

test("ignores node commands that run no script", () => {
  assert.deepEqual(check(job("      - run: node --version && node -v"), {}), []);
});

test("resolves a script path given from the workspace", () => {
  for (const command of [
    `node \${{ github.workspace }}/s/main.mjs`,
    'node "$GITHUB_WORKSPACE/s/main.mjs"',
    `node \${GITHUB_WORKSPACE}/s/main.mjs`,
    "node ./s/main.mjs",
  ]) {
    const violations = check(job(`      - run: ${command}`), importsYaml);

    assert.equal(violations.length, 1, command);
    assert.match(violations[0].message, /runs s\/main\.mjs, which imports package yaml/, command);
  }
});

test("resolves a script path against the step's working directory, then the job's defaults", () => {
  const files = { "apps/x/s/main.mjs": 'import "yaml";\n' };

  const fromStep = check(
    job("      - run: node s/main.mjs", "        working-directory: apps/x"),
    files,
  );
  assert.equal(fromStep.length, 1);
  assert.match(fromStep[0].message, /runs apps\/x\/s\/main\.mjs, which imports package yaml/);

  const withDefaults = [
    "jobs:",
    "  build:",
    "    defaults:",
    "      run:",
    "        working-directory: apps/x",
    "    steps:",
    "      - run: node s/main.mjs",
  ];
  const fromDefaults = check(withDefaults, files);
  assert.equal(fromDefaults.length, 1);
  assert.match(fromDefaults[0].message, /runs apps\/x\/s\/main\.mjs, which imports package yaml/);
});

test("refuses a script path the check cannot resolve", () => {
  const violations = check(job("      - name: Run", '        run: node "$SCRIPT" arg'), {});

  assert.deepEqual(violations, [
    {
      path: WORKFLOW,
      line: 4,
      message:
        'step "Run" of job build runs node with a script path that cannot be resolved: $SCRIPT',
    },
  ]);
});

test("refuses a script run from a working directory that cannot be resolved", () => {
  const steps = [
    "      - run: node s/main.mjs",
    `        working-directory: \${{ runner.temp }}/x`,
  ];

  assert.match(check(job(steps), importsYaml)[0].message, /cannot be resolved/);
});

test("refuses a script, or a local module it imports, that does not exist", () => {
  assert.match(
    check(job("      - run: node s/missing.mjs"), {})[0].message,
    /runs s\/missing\.mjs, which does not exist/,
  );
  assert.match(
    check(job("      - run: node s/main.mjs"), { "s/main.mjs": 'import "./gone.mjs";\n' })[0]
      .message,
    /runs s\/main\.mjs, whose module s\/main\.mjs imports s\/gone\.mjs, which does not exist/,
  );
});

test("labels a step by its name, then its id, then its command", () => {
  const steps = [
    "      - id: plan",
    "        run: node s/main.mjs",
    "      - run: node s/main.mjs",
  ];

  assert.deepEqual(
    check(job(steps), importsYaml).map((violation) => violation.message.split(" of job")[0]),
    ['step "plan"', 'step "node s/main.mjs"'],
  );
});

test("resolves steps, a step and its run: that are aliases", () => {
  const workflow = [
    "x-steps: &steps",
    "  - run: &run node s/main.mjs",
    "jobs:",
    "  build:",
    "    steps: *steps",
    "  test:",
    "    steps:",
    "      - run: *run",
  ];

  assert.equal(check(workflow, importsYaml).length, 2);
});

test("reports a workflow that does not parse as YAML instead of passing it silently", () => {
  const violations = check(["jobs:", "  build:", '    runs-on: "ubuntu-24.04']);

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /does not parse as YAML/);
});

test("describes a violation with its file, line and message", () => {
  assert.equal(describeViolation({ path: "a.yml", line: 4, message: "m" }), "a.yml:4: m");
});

test("every node script in every workflow runs after its packages are installed", () => {
  const files = findWorkflowFiles();
  assert.ok(files.length > 0, "expected to find at least one workflow file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "a node script that imports a package fails in a job that has not installed the " +
      "repository's dependencies; add a pnpm install step before it, or import only Node built-ins.",
  );
});
