import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findWorkflowFiles,
} from "./workflow-retry-loops-fit-timeouts.mjs";

function indented(spaces, lines) {
  return lines.map((line) => (line === "" ? "" : `${" ".repeat(spaces)}${line}`));
}

function workflowWith({
  run,
  stepTimeout = null,
  jobTimeout = 30,
  stepName = "Retry",
  stepExtra = [],
  jobExtra = [],
  top = [],
}) {
  return [
    ...top,
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-24.04",
    ...(jobTimeout === null ? [] : [`    timeout-minutes: ${jobTimeout}`]),
    ...indented(4, jobExtra),
    "    steps:",
    ...(stepName === null ? ["      - run: |"] : [`      - name: ${stepName}`, "        run: |"]),
    ...indented(10, run),
    ...(stepTimeout === null ? [] : [`        timeout-minutes: ${stepTimeout}`]),
    ...indented(8, stepExtra),
  ].join("\n");
}

function check(source) {
  return checkFiles(["a.yml"], () => source);
}

function messagesOf(options) {
  return check(workflowWith(options)).map((violation) => violation.message);
}

const PULL_WITH_RETRIES = [
  "for delay in 0 15 30 60; do",
  '  sleep "$delay"',
  '  timeout 300 docker pull "$IMAGE" && exit 0',
  "done",
  "exit 1",
];

test("passes a retry loop that ends within its job's timeout", () => {
  assert.deepEqual(messagesOf({ run: PULL_WITH_RETRIES, jobTimeout: 22 }), []);
});

test("flags a retry loop that can outlast its job's timeout, naming the step, the total and the timeout", () => {
  assert.deepEqual(check(workflowWith({ run: PULL_WITH_RETRIES, jobTimeout: 21 })), [
    {
      path: "a.yml",
      line: 6,
      message:
        'step "Retry" of job build can take 1305 seconds in its retry loops, more than the 21 minutes its job\'s timeout-minutes allows',
    },
  ]);
});

test("flags a retry loop that can outlast its step's timeout", () => {
  assert.deepEqual(messagesOf({ run: PULL_WITH_RETRIES, stepTimeout: 20, jobTimeout: 60 }), [
    'step "Retry" of job build can take 1305 seconds in its retry loops, more than the 20 minutes its step\'s timeout-minutes allows',
  ]);
});

test("holds a step to its job's timeout when the job's is the shorter", () => {
  assert.deepEqual(messagesOf({ run: PULL_WITH_RETRIES, stepTimeout: 30, jobTimeout: 21 }), [
    'step "Retry" of job build can take 1305 seconds in its retry loops, more than the 21 minutes its job\'s timeout-minutes allows',
  ]);
});

test("holds a job with no timeout-minutes to GitHub's default of 360 minutes", () => {
  const run = ["for attempt in 1 2 3; do", "  sleep 8000", "done"];

  assert.deepEqual(messagesOf({ run, jobTimeout: null }), [
    'step "Retry" of job build can take 24000 seconds in its retry loops, more than the 360 minutes its job\'s default time limit allows',
  ]);
});

test("reads a step timeout reached through an alias", () => {
  const source = [
    "x-limits:",
    "  short: &short-limit 20",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-24.04",
    "    timeout-minutes: 60",
    "    steps:",
    "      - name: Retry",
    "        timeout-minutes: *short-limit",
    "        run: |",
    ...indented(10, PULL_WITH_RETRIES),
  ].join("\n");

  assert.equal(check(source).length, 1);
  assert.match(check(source)[0].message, /more than the 20 minutes its step's timeout-minutes/);
});

test("reads a job timeout reached through an alias", () => {
  const source = [
    "jobs:",
    "  lint:",
    "    runs-on: ubuntu-24.04",
    "    timeout-minutes: &short-limit 21",
    "  build:",
    "    runs-on: ubuntu-24.04",
    "    timeout-minutes: *short-limit",
    "    steps:",
    "      - name: Retry",
    "        run: |",
    ...indented(10, PULL_WITH_RETRIES),
  ].join("\n");

  assert.deepEqual(
    check(source).map((violation) => violation.message),
    [
      'step "Retry" of job build can take 1305 seconds in its retry loops, more than the 21 minutes its job\'s timeout-minutes allows',
    ],
  );
});

test("reads a job and a step that are themselves aliases", () => {
  const source = [
    "x-step: &retry-step",
    "  name: Retry",
    "  run: |",
    ...indented(4, PULL_WITH_RETRIES),
    "x-job: &retry-job",
    "  runs-on: ubuntu-24.04",
    "  timeout-minutes: 21",
    "  steps:",
    "    - *retry-step",
    "jobs:",
    "  build: *retry-job",
  ].join("\n");

  assert.equal(check(source).length, 1);
});

test("adds up sleeps computed with arithmetic on the loop variable", () => {
  const run = [
    "for attempt in 1 2 3; do",
    "  npm install -g some-cli && exit 0",
    "  sleep $((attempt * 100))",
    "done",
  ];

  assert.match(messagesOf({ run, jobTimeout: 9 })[0], /can take 600 seconds/);
  assert.deepEqual(messagesOf({ run, jobTimeout: 10 }), []);
});

test("does not count a sleep its loop variable rules out", () => {
  const run = [
    "for attempt in 1 2 3; do",
    "  if timeout 60 npm install -g some-cli; then",
    "    exit 0",
    "  fi",
    '  if [ "$attempt" -lt 3 ]; then',
    "    sleep $((attempt * 100))",
    "  fi",
    "done",
  ];

  assert.match(messagesOf({ run, jobTimeout: 1 })[0], /can take 480 seconds/);
});

test("counts a until loop with a literal attempt counter", () => {
  const run = [
    "attempt=1",
    'until timeout 120 docker pull "$IMAGE"; do',
    '  if [ "$attempt" -ge 4 ]; then exit 1; fi',
    "  attempt=$((attempt + 1))",
    "  sleep 30",
    "done",
  ];

  assert.match(messagesOf({ run, jobTimeout: 1 })[0], /can take 570 seconds/);
});

test("counts a while loop with a literal attempt counter in its condition", () => {
  const run = [
    "attempt=0",
    'while [ "$attempt" -lt 5 ]; do',
    '  timeout 100 docker pull "$IMAGE" && break',
    "  attempt=$((attempt + 1))",
    "  sleep 20",
    "done",
  ];

  assert.match(messagesOf({ run, jobTimeout: 1 })[0], /can take 600 seconds/);
});

test("counts a loop that breaks once its counter reaches a literal limit", () => {
  const run = [
    "attempt=0",
    "while true; do",
    "  ((attempt++))",
    '  timeout 100 docker pull "$IMAGE" && break',
    "  [[ $attempt -ge 3 ]] && exit 1",
    "  sleep 10",
    "done",
  ];

  assert.match(messagesOf({ run, jobTimeout: 1 })[0], /can take 320 seconds/);
});

test("counts an arithmetic for loop", () => {
  const run = [
    "for ((attempt = 0; attempt < 4; attempt++)); do",
    "  timeout 1m docker pull image && exit 0",
    "done",
  ];

  assert.match(messagesOf({ run, jobTimeout: 1 })[0], /can take 240 seconds/);
});

test("counts loops over a brace range, seq and a literal variable", () => {
  for (const header of [
    "for attempt in {1..4}; do",
    "for attempt in $(seq 1 4); do",
    'attempts="1 2 3 4"; for attempt in $attempts; do',
  ]) {
    const run = [header, "  timeout 100 docker pull image && exit 0", "done"];

    assert.match(messagesOf({ run, jobTimeout: 1 })[0] ?? "", /can take 400 seconds/, header);
  }
});

test("reads the loop's delays from the step's literal env", () => {
  const run = ["for attempt in 1 2 3; do", '  sleep "$RETRY_DELAY"', "done"];

  assert.match(
    messagesOf({ run, jobTimeout: 1, stepExtra: ["env:", "  RETRY_DELAY: 30"] })[0],
    /can take 90 seconds/,
  );
});

test("reads time limits written with units and a kill grace", () => {
  const run = [
    "for delay in 0 1m; do",
    '  sleep "$delay"',
    "  timeout --kill-after=30 2m docker pull image && exit 0",
    "done",
  ];

  assert.match(messagesOf({ run, jobTimeout: 1 })[0], /can take 360 seconds/);
});

test("counts a retry loop inside a function each time it is called", () => {
  const run = [
    "retry() {",
    "  for delay in 0 30; do",
    '    sleep "$delay"',
    '    timeout 100 "$@" && return 0',
    "  done",
    "  return 1",
    "}",
    "retry docker pull first",
    "retry docker pull second",
  ];

  assert.match(messagesOf({ run, jobTimeout: 1 })[0], /can take 460 seconds/);
});

test("adds up every retry loop of a step", () => {
  const run = [...PULL_WITH_RETRIES.slice(0, 4), ...PULL_WITH_RETRIES.slice(0, 4)];

  assert.match(messagesOf({ run, jobTimeout: 1 })[0], /can take 2610 seconds/);
});

test("counts only the sleeps of attempts with no time limit, and names what it could not bound", () => {
  const run = [
    "for attempt in 1 2 3; do",
    "  npm install -g some-cli && exit 0",
    "  sleep 30",
    "done",
  ];

  assert.deepEqual(messagesOf({ run, jobTimeout: 1 }), [
    'step "Retry" of job build can take 90 seconds in its retry loops, more than the 1 minutes its job\'s timeout-minutes allows; not counted, having no time bound: `npm install -g some-cli` (3 runs)',
  ]);
});

test("names a sleep of a length it cannot know as not counted", () => {
  const run = [
    "for attempt in 1 2 3; do",
    "  timeout 30 docker pull image && exit 0",
    '  sleep "$UNKNOWN_DELAY"',
    "done",
  ];

  assert.match(
    messagesOf({ run, jobTimeout: 1 })[0],
    /can take 90 seconds .*; not counted, having no time bound: `sleep "\$UNKNOWN_DELAY"` \(3 runs\)$/,
  );
});

test("names the step by its id, or by its command when it has neither name nor id", () => {
  const run = ["for attempt in 1 2 3; do", "  sleep 30", "done"];

  assert.match(
    messagesOf({ run, jobTimeout: 1, stepName: null, stepExtra: ["id: pull"] })[0],
    /^step "pull" of job build/,
  );
  assert.match(
    messagesOf({ run, jobTimeout: 1, stepName: null })[0],
    /^step "for attempt in 1 2 3; do" of job build/,
  );
});

test("ignores loops whose number of attempts it cannot count", () => {
  for (const loop of [
    ["for file in $(git ls-files); do", "  sleep 600", "done"],
    ['for file in "$@"; do', "  sleep 600", "done"],
    ["while read -r line; do", "  sleep 600", "done < list.txt"],
    ["until timeout 10 curl -f http://localhost; do", "  sleep 600", "done"],
  ]) {
    assert.deepEqual(messagesOf({ run: loop, jobTimeout: 1 }), [], loop[0]);
  }
});

test("ignores time spent outside any loop", () => {
  const run = ["timeout 600 docker pull image", "sleep 600"];

  assert.deepEqual(messagesOf({ run, jobTimeout: 1 }), []);
});

test("ignores a script run by a shell other than bash", () => {
  const run = ["for attempt in 1 2 3; do", "  sleep 600", "done"];

  assert.deepEqual(messagesOf({ run, jobTimeout: 1, stepExtra: ["shell: pwsh"] }), []);
  assert.deepEqual(
    messagesOf({ run, jobTimeout: 1, jobExtra: ["defaults:", "  run:", "    shell: python"] }),
    [],
  );
  assert.equal(messagesOf({ run, jobTimeout: 1, stepExtra: ["shell: bash -e {0}"] }).length, 1);
});

test("ignores a step of a Windows job, whose default shell is PowerShell", () => {
  const source = [
    "jobs:",
    "  build:",
    "    runs-on: windows-latest",
    "    timeout-minutes: 1",
    "    steps:",
    "      - run: |",
    "          for attempt in 1 2 3; do",
    "            sleep 600",
    "          done",
  ].join("\n");

  assert.deepEqual(check(source), []);
});

test("does not mistake a heredoc, a comment or a quoted word for a loop", () => {
  const run = [
    "# for attempt in 1 2 3; do sleep 600; done",
    "cat <<'EOF' > notes.txt",
    "for attempt in 1 2 3; do",
    "  sleep 600",
    "done",
    "EOF",
    'echo "for attempt in 1 2 3; do sleep 600; done"',
  ];

  assert.deepEqual(messagesOf({ run, jobTimeout: 1 }), []);
});

test("reports a script it cannot read instead of passing it silently", () => {
  const run = ["for attempt in 1 2 3; do", "  sleep 600"];

  const messages = messagesOf({ run, jobTimeout: 1 });

  assert.equal(messages.length, 1);
  assert.match(messages[0], /^step "Retry" of job build does not parse as a shell script/);
});

test("reports a workflow that does not parse as YAML instead of passing it silently", () => {
  const violations = check(["jobs:", "  build:", '    runs-on: "ubuntu-24.04'].join("\n"));

  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /does not parse as YAML/);
});

test("describes a violation with its file, line and message", () => {
  assert.equal(
    describeViolation({ path: "a.yml", line: 6, message: 'step "Retry" of job build can take' }),
    'a.yml:6: step "Retry" of job build can take',
  );
});

test("every retry loop in every workflow ends within the timeout in force", () => {
  const files = findWorkflowFiles();
  assert.ok(files.length > 0, "expected to find at least one workflow file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "GitHub cancels a step mid-attempt once its timeout-minutes (or its job's) runs out, so the " +
      "retries never get to absorb the failure; raise the timeout above the loop's total.",
  );
});
