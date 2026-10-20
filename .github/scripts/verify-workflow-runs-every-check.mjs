import { readFileSync } from "node:fs";
import { isAlias, isMap, isScalar, isSeq, parse, parseDocument } from "yaml";

const WORKFLOW_PATH = ".github/workflows/verify.yml";
const PACKAGE_JSON_PATH = "package.json";
const COMPOSE_PATH = "docker-compose.yml";
const DOCKER_HUB_HOSTS = new Set([
  "docker.io",
  "index.docker.io",
  "registry-1.docker.io",
  "registry.hub.docker.com",
]);
const INSTALLED_PLAYWRIGHT_PACKAGE_JSON_PATH = "node_modules/playwright/package.json";
const GITHUB_TOKEN_EXPRESSION = `\${{ github.token }}`;
const SIGN_IN_TO_GHCR_COMMAND =
  'echo "$GITHUB_TOKEN" | docker login ghcr.io --username "$GITHUB_ACTOR" --password-stdin';
const SKOPEO_SIGN_IN_TO_GHCR =
  'echo "$GITHUB_TOKEN" | skopeo login ghcr.io --username "$GITHUB_ACTOR" --password-stdin';
const COPY_RETRY_DELAYS_SECONDS = [0, 15, 30, 60];
const EXPECTED_MIRROR_OUTPUT = `\${{ steps.mirror.outputs.mirrored }}`;
const CLOUD_POSTGRES_IMAGE = {
  label: "the cloud's Postgres image",
  setupPath: "apps/cloud/vitest.global-setup.postgres.ts",
  constant: "POSTGRES_IMAGE",
  job: "tests",
  testsScript: "verify:tests",
  registry: "ghcr.io",
  lookupJob: "postgres-image",
  copyJob: "postgres-image-copy",
  copyAttemptSeconds: 300,
  pullAttemptSeconds: 120,
};
const PLAYWRIGHT_IMAGE = {
  label: "the Playwright image",
  setupPath: "vitest.global-setup.playwright-server.ts",
  constant: "PLAYWRIGHT_SERVER_IMAGE",
  registry: "ghcr.io",
  lookupJob: "playwright-image",
  copyJob: "playwright-image-copy",
  copyAttemptSeconds: 600,
  // The runner's image store restarts every layer on each attempt, and this image is large.
  pullAttemptSeconds: 300,
};
const PLAYWRIGHT_IMAGE_JOBS = {
  tests: { ...PLAYWRIGHT_IMAGE, job: "tests", testsScript: "verify:tests" },
  visual: { ...PLAYWRIGHT_IMAGE, job: "visual", testsScript: "verify:visual" },
};
const PRE_PULLED_IMAGES = [CLOUD_POSTGRES_IMAGE, ...Object.values(PLAYWRIGHT_IMAGE_JOBS)];

function retrySeconds(attemptSeconds) {
  return COPY_RETRY_DELAYS_SECONDS.reduce((total, delay) => total + delay + attemptSeconds, 0);
}

function lookUpMirrorCommand(spec) {
  return [
    SKOPEO_SIGN_IN_TO_GHCR,
    `if timeout 60 skopeo inspect --raw "docker://\${${spec.constant}%%:*}@\${${spec.constant}#*@}" > /dev/null; then`,
    '  echo "mirrored=true" >> "$GITHUB_OUTPUT"',
    "else",
    '  echo "mirrored=false" >> "$GITHUB_OUTPUT"',
    "fi",
  ].join("\n");
}

function copyMirrorCommand(spec) {
  return [
    SKOPEO_SIGN_IN_TO_GHCR,
    `for delay in ${COPY_RETRY_DELAYS_SECONDS.join(" ")}; do`,
    '  sleep "$delay"',
    `  timeout ${spec.copyAttemptSeconds} skopeo copy --all --preserve-digests "docker://\${SOURCE_IMAGE%%:*}@\${SOURCE_IMAGE#*@}" "docker://\${${spec.constant}%@*}" && exit 0`,
    "done",
    "exit 1",
  ].join("\n");
}

function expectedCopyCondition(spec) {
  return `\${{ needs.${spec.lookupJob}.outputs.mirrored == 'false' }}`;
}

function pullWithRetriesCommand(spec) {
  return [
    "for delay in 0 15 30 60; do",
    '  sleep "$delay"',
    `  timeout ${spec.pullAttemptSeconds} docker pull "$${spec.constant}" && exit 0`,
    "done",
    "exit 1",
  ].join("\n");
}

const EXPECTED_VERIFY_SCRIPT = "pnpm verify:static && pnpm verify:tests && pnpm verify:visual";
const EXPECTED_VERIFY_TESTS_SCRIPT = "vitest run --project='!catalog-visual'";
const EXPECTED_VERIFY_VISUAL_SCRIPT = "vitest run --project=catalog-visual";
const REQUIRED_VERIFY_STATIC_COMMANDS = [
  "tsc --noEmit",
  "tsc --noEmit -p apps/backoffice",
  "tsc --noEmit -p apps/pos",
  "tsc --noEmit -p apps/cloud/tsconfig.test.json",
  "pnpm --filter @purosur/cloud build",
  "pnpm --filter @purosur/backoffice build",
  "node .github/scripts/backoffice-download-budget.mjs",
  "pnpm --filter @purosur/pos build",
  "biome ci . --error-on-warnings",
  "pnpm depcruise",
  "knip",
  "node .github/scripts/react-compiler-check.mjs",
  `node --test --test-shard=\${TEST_SHARD:-1/1} .github/scripts/*.test.mjs .github/scripts/test-support/*.test.mjs .claude/hooks/*.test.mjs`,
];
const STATIC_PART_COMMAND = /^pnpm (verify:static:[a-z][a-z0-9-]*)$/;
const STATIC_SHARD = /^([1-9][0-9]*)\/([1-9][0-9]*)$/;
const STATIC_SHARD_OPTION = `--test-shard=\${TEST_SHARD:-1/1}`;
const EXPECTED_STATIC_RUN = `\${{ matrix.command }}`;
const EXPECTED_STATIC_TEST_SHARD = `\${{ matrix.shard }}`;
const EXPECTED_STATIC_BASE_REF = `\${{ github.event_name == 'push' && github.event.before || github.event.pull_request.base.sha }}`;
const EXPECTED_RUN_CONDITION = `\${{ !cancelled() && (github.event_name != 'pull_request' || needs.scope.result != 'success' || needs.scope.outputs.docs_only != 'true') }}`;
const EXPECTED_TESTS_CONDITION = `\${{ !cancelled() && (github.event_name != 'pull_request' || needs.scope.result != 'success' || needs.scope.outputs.tests_needed != 'false') }}`;
const EXPECTED_VISUAL_CONDITION = `\${{ !cancelled() && needs.scope.outputs.catalog_changed != 'false' }}`;
const EXPECTED_VERIFY_CONDITION = "always()";
const SCOPE_STEP_ID = "scope";
const SCOPE_COMMAND = "node .github/scripts/change-scope.mjs";
const SCOPE_DECISIONS = ["docs_only", "tests_needed", "catalog_changed"];
const HISTORY_SCAN_COMMAND = "node --test .github/scripts/no-secrets-in-commit-history.test.mjs";
const EXPECTED_HISTORY_SCAN_BASE_REF = `\${{ github.event.pull_request.base.sha }}`;
const AGGREGATE_COMMAND = "node .github/scripts/aggregate-verify-result.mjs";
const EXPECTED_AGGREGATE_ENV = {
  EVENT_NAME: `\${{ github.event_name }}`,
  SCOPE_RESULT: `\${{ needs.scope.result }}`,
  SCOPE_DOCS_ONLY: `\${{ needs.scope.outputs.docs_only }}`,
  SCOPE_TESTS_NEEDED: `\${{ needs.scope.outputs.tests_needed }}`,
  SCOPE_CATALOG_CHANGED: `\${{ needs.scope.outputs.catalog_changed }}`,
  STATIC_RESULT: `\${{ needs.static.result }}`,
  TESTS_RESULT: `\${{ needs.tests.result }}`,
  VISUAL_RESULT: `\${{ needs.visual.result }}`,
};

function resolveNode(doc, node) {
  return isAlias(node) ? node.resolve(doc) : node;
}

function resolveScalar(doc, node) {
  const resolved = resolveNode(doc, node);
  return isScalar(resolved) ? resolved.value : resolved;
}

function mapGet(doc, mapNode, key) {
  const resolved = resolveNode(doc, mapNode);
  return isMap(resolved) ? resolved.get(key, true) : undefined;
}

function mapHas(doc, mapNode, key) {
  const resolved = resolveNode(doc, mapNode);
  return isMap(resolved) && resolved.has(key);
}

function jobNode(doc, jobId) {
  // The yaml package's Document root proxies .get() but is not itself a Map instance, so mapGet
  // (which checks isMap) cannot be used for this one top-level lookup.
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  return mapGet(doc, jobsNode, jobId);
}

function steps(doc, job) {
  const stepsNode = resolveNode(doc, mapGet(doc, job, "steps"));
  if (!isSeq(stepsNode)) return [];
  return stepsNode.items.map((stepItem) => resolveNode(doc, stepItem));
}

function stepRunningExactly(doc, job, command) {
  return steps(doc, job).find((step) => {
    const run = resolveScalar(doc, mapGet(doc, step, "run"));
    return typeof run === "string" && run.trim() === command;
  });
}

function mayContinueOnError(doc, node) {
  return (
    mapHas(doc, node, "continue-on-error") &&
    resolveScalar(doc, mapGet(doc, node, "continue-on-error")) !== false
  );
}

function matrixNode(doc, job) {
  const strategyNode = resolveNode(doc, mapGet(doc, job, "strategy"));
  return resolveNode(doc, mapGet(doc, strategyNode, "matrix"));
}

function matrixShardValues(doc, job) {
  const shardNode = resolveNode(doc, mapGet(doc, matrixNode(doc, job), "shard"));
  if (!isSeq(shardNode)) return null;
  return shardNode.items.map((item) => Number(resolveScalar(doc, item)));
}

function isContiguousShardRange(values) {
  if (values === null || values.length === 0) return false;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.every((value, index) => value === index + 1);
}

// GitHub Actions' `needs:` accepts either a single job id or a list of them.
function neededJobs(doc, job) {
  const needsNode = resolveNode(doc, mapGet(doc, job, "needs"));
  if (isSeq(needsNode)) return needsNode.items.map((item) => resolveScalar(doc, item));
  const single = resolveScalar(doc, needsNode);
  return typeof single === "string" ? [single] : [];
}

function runnerJobViolations(doc, jobId, job, command, expectedCondition) {
  const violations = [];

  const condition = resolveScalar(doc, mapGet(doc, job, "if"));
  if (condition !== expectedCondition) {
    violations.push(
      `verify.yml's ${jobId} job runs under \`if: ${condition}\`, expected \`if: ${expectedCondition}\``,
    );
  }
  if (mayContinueOnError(doc, job)) {
    violations.push(`verify.yml's ${jobId} job sets continue-on-error`);
  }
  if (mapHas(doc, job, "defaults")) {
    violations.push(`verify.yml's ${jobId} job sets defaults`);
  }

  const step = stepRunningExactly(doc, job, command);
  if (step === undefined) {
    violations.push(`verify.yml's ${jobId} job has no step whose run is exactly \`${command}\``);
    return violations;
  }
  if (mayContinueOnError(doc, step)) {
    violations.push(`verify.yml's ${jobId} job's verify:${jobId} step sets continue-on-error`);
  }
  if (mapHas(doc, step, "if")) {
    violations.push(`verify.yml's ${jobId} job's verify:${jobId} step has its own if`);
  }
  if (mapHas(doc, step, "shell")) {
    violations.push(`verify.yml's ${jobId} job's verify:${jobId} step sets its own shell`);
  }
  return violations;
}

// Scope runs even when static and tests are skipped for a docs-only change, whose net diff can hide
// a secret one of its commits added and a later one removed.
function scopeJobViolations(doc, job) {
  const violations = [];

  if (mayContinueOnError(doc, job)) {
    violations.push("verify.yml's scope job sets continue-on-error");
  }
  if (mapHas(doc, job, "defaults")) {
    violations.push("verify.yml's scope job sets defaults");
  }

  const scopeStep = steps(doc, job).find(
    (step) => resolveScalar(doc, mapGet(doc, step, "id")) === SCOPE_STEP_ID,
  );
  const scopeRun = resolveScalar(doc, mapGet(doc, scopeStep, "run"));
  if (typeof scopeRun !== "string" || scopeRun.trim() !== SCOPE_COMMAND) {
    violations.push(
      `verify.yml's scope job has no step with id ${SCOPE_STEP_ID} whose run is exactly \`${SCOPE_COMMAND}\``,
    );
  }

  const outputsNode = resolveNode(doc, mapGet(doc, job, "outputs"));
  const published = isMap(outputsNode)
    ? outputsNode.items.map((pair) => String(resolveScalar(doc, pair.key)))
    : [];
  for (const name of new Set([...SCOPE_DECISIONS, ...published])) {
    const actual = resolveScalar(doc, mapGet(doc, outputsNode, name));
    const expected = `\${{ steps.${SCOPE_STEP_ID}.outputs.${name} }}`;
    if (actual !== expected) {
      violations.push(
        `verify.yml's scope job's ${name} output is \`${actual}\`, expected \`${expected}\``,
      );
    }
  }

  const step = stepRunningExactly(doc, job, HISTORY_SCAN_COMMAND);
  if (step === undefined) {
    violations.push(
      `verify.yml's scope job has no step whose run is exactly \`${HISTORY_SCAN_COMMAND}\``,
    );
    return violations;
  }
  if (mayContinueOnError(doc, step)) {
    violations.push("verify.yml's scope job's commit history scan step sets continue-on-error");
  }
  if (mapHas(doc, step, "if")) {
    violations.push("verify.yml's scope job's commit history scan step has its own if");
  }
  if (mapHas(doc, step, "shell")) {
    violations.push("verify.yml's scope job's commit history scan step sets its own shell");
  }
  const baseRef = resolveScalar(doc, mapGet(doc, mapGet(doc, step, "env"), "CHANGE_BASE_REF"));
  if (baseRef !== EXPECTED_HISTORY_SCAN_BASE_REF) {
    violations.push(
      `verify.yml's scope job's commit history scan step's CHANGE_BASE_REF is \`${baseRef}\`, expected \`${EXPECTED_HISTORY_SCAN_BASE_REF}\``,
    );
  }
  return violations;
}

function verifyJobViolations(doc, job) {
  const violations = [];

  const needs = neededJobs(doc, job);
  for (const jobId of ["static", "tests", "visual"]) {
    if (!needs.includes(jobId)) {
      violations.push(`verify.yml's verify job does not need ${jobId}`);
    }
  }

  const condition = resolveScalar(doc, mapGet(doc, job, "if"));
  if (condition !== EXPECTED_VERIFY_CONDITION) {
    violations.push(
      `verify.yml's verify job runs under \`if: ${condition}\`, expected \`if: ${EXPECTED_VERIFY_CONDITION}\``,
    );
  }
  if (mayContinueOnError(doc, job)) {
    violations.push("verify.yml's verify job sets continue-on-error");
  }
  if (mapHas(doc, job, "defaults")) {
    violations.push("verify.yml's verify job sets defaults");
  }

  const step = stepRunningExactly(doc, job, AGGREGATE_COMMAND);
  if (step === undefined) {
    violations.push(
      `verify.yml's verify job has no step whose run is exactly \`${AGGREGATE_COMMAND}\``,
    );
    return violations;
  }
  if (mayContinueOnError(doc, step)) {
    violations.push("verify.yml's verify job's aggregate step sets continue-on-error");
  }
  if (mapHas(doc, step, "if")) {
    violations.push("verify.yml's verify job's aggregate step has its own if");
  }
  if (mapHas(doc, step, "shell")) {
    violations.push("verify.yml's verify job's aggregate step sets its own shell");
  }
  const envNode = mapGet(doc, step, "env");
  for (const [name, expected] of Object.entries(EXPECTED_AGGREGATE_ENV)) {
    const actual = resolveScalar(doc, mapGet(doc, envNode, name));
    if (actual !== expected) {
      violations.push(
        `verify.yml's verify job's aggregate step's ${name} is \`${actual}\`, expected \`${expected}\``,
      );
    }
  }
  return violations;
}

function plainCommands(script) {
  if (typeof script !== "string") return null;
  const commands = script.split("&&").map((command) => command.trim());
  const everyCommandPropagatesFailure = commands.every(
    (command) => command !== "" && !/[|;&`#\n\r]|\$\(/.test(command),
  );
  return everyCommandPropagatesFailure ? commands : null;
}

function staticPartNames(script) {
  const names = plainCommands(script)?.map((command) => command.match(STATIC_PART_COMMAND)?.[1]);
  return names?.every(Boolean) ? names : null;
}

function staticPartsViolations(scripts, partNames) {
  const violations = [];
  const commands = [];
  for (const name of partNames) {
    const partCommands = plainCommands(scripts?.[name]);
    if (partCommands === null) {
      violations.push(
        `package.json's "${name}" script is "${scripts?.[name]}", expected plain commands joined by &&`,
      );
    } else {
      commands.push(...partCommands);
    }
  }
  if (violations.length > 0) return violations;
  for (const required of REQUIRED_VERIFY_STATIC_COMMANDS) {
    if (!commands.includes(required)) {
      violations.push(`package.json's verify:static parts run no "${required}"`);
    }
  }
  return violations;
}

function isContiguousStaticShards(shards) {
  const parsed = shards.map((shard) => String(shard).match(STATIC_SHARD));
  return (
    parsed.every((match) => match !== null && Number(match[2]) === shards.length) &&
    isContiguousShardRange(parsed.map((match) => Number(match[1])))
  );
}

function staticMatrixViolations(doc, job, scripts, partNames) {
  const violations = [];
  const matrix = matrixNode(doc, job);
  const keys = isMap(matrix)
    ? matrix.items.map((pair) => String(resolveScalar(doc, pair.key)))
    : [];
  for (const key of keys.filter((key) => key !== "include")) {
    violations.push(`verify.yml's static job strategy.matrix sets ${key}`);
  }
  if (partNames === null) return violations;

  const includeNode = resolveNode(doc, mapGet(doc, matrix, "include"));
  const entries = isSeq(includeNode)
    ? includeNode.items.map((item) => {
        const entry = resolveNode(doc, item);
        return {
          command: resolveScalar(doc, mapGet(doc, entry, "command")),
          shard: mapHas(doc, entry, "shard")
            ? resolveScalar(doc, mapGet(doc, entry, "shard"))
            : null,
        };
      })
    : [];
  const runs = new Map(partNames.map((name) => [`pnpm ${name}`, { name, whole: 0, shards: [] }]));
  for (const { command, shard } of entries) {
    const run = runs.get(command);
    if (run === undefined) {
      violations.push(
        `verify.yml's static job runs \`${command}\`, which is not a part of verify:static`,
      );
    } else if (shard === null) {
      run.whole += 1;
    } else {
      run.shards.push(shard);
    }
  }
  for (const [command, { name, whole, shards }] of runs) {
    if (whole + shards.length === 0) {
      violations.push(`verify.yml's static job runs no \`${command}\``);
    } else if (whole > 1 || (whole === 1 && shards.length > 0)) {
      violations.push(`verify.yml's static job runs \`${command}\` more than once`);
    } else if (shards.length > 0 && !isContiguousStaticShards(shards)) {
      violations.push(
        `verify.yml's static job's shards of \`${command}\` are not a contiguous 1..n range covering every shard once`,
      );
    } else if (shards.length > 0 && !String(scripts?.[name]).includes(STATIC_SHARD_OPTION)) {
      violations.push(
        `verify.yml's static job runs \`${command}\` in shards, but its script does not pass ${STATIC_SHARD_OPTION}`,
      );
    }
  }
  const step = stepRunningExactly(doc, job, EXPECTED_STATIC_RUN);
  if (step !== undefined && entries.some(({ shard }) => shard !== null)) {
    const testShard = resolveScalar(doc, mapGet(doc, mapGet(doc, step, "env"), "TEST_SHARD"));
    if (testShard !== EXPECTED_STATIC_TEST_SHARD) {
      violations.push(
        `verify.yml's static job's verify:static step's TEST_SHARD is \`${testShard}\`, expected \`${EXPECTED_STATIC_TEST_SHARD}\``,
      );
    }
  }
  return violations;
}

// The migration guard and the secret scan among the automation tests read the change's history
// from its base.
function staticHistoryViolations(doc, job) {
  const violations = [];
  const checkout = steps(doc, job).find((step) =>
    String(resolveScalar(doc, mapGet(doc, step, "uses")) ?? "").startsWith("actions/checkout@"),
  );
  const fetchDepth = resolveScalar(doc, mapGet(doc, mapGet(doc, checkout, "with"), "fetch-depth"));
  if (fetchDepth !== 0) {
    violations.push("verify.yml's static job checks out without fetch-depth: 0");
  }
  const step = stepRunningExactly(doc, job, EXPECTED_STATIC_RUN);
  if (step !== undefined) {
    const baseRef = resolveScalar(doc, mapGet(doc, mapGet(doc, step, "env"), "CHANGE_BASE_REF"));
    if (baseRef !== EXPECTED_STATIC_BASE_REF) {
      violations.push(
        `verify.yml's static job's verify:static step's CHANGE_BASE_REF is \`${baseRef}\`, expected \`${EXPECTED_STATIC_BASE_REF}\``,
      );
    }
  }
  return violations;
}

export function findVerifyWorkflowViolations(workflowSource, packageJsonSource) {
  const doc = parseDocument(workflowSource);
  if (doc.errors.length > 0) {
    return [`verify.yml does not parse as YAML: ${doc.errors[0].message}`];
  }

  const violations = [];

  if (mapHas(doc, doc.contents, "defaults")) {
    violations.push("verify.yml sets workflow-level defaults");
  }

  const scopeJob = jobNode(doc, "scope");
  if (scopeJob === undefined) {
    violations.push("verify.yml has no scope job");
  } else {
    violations.push(...scopeJobViolations(doc, scopeJob));
  }

  const scripts = JSON.parse(packageJsonSource).scripts;
  const staticParts = staticPartNames(scripts?.["verify:static"]);

  const staticJob = jobNode(doc, "static");
  if (staticJob === undefined) {
    violations.push("verify.yml has no static job");
  } else {
    violations.push(
      ...runnerJobViolations(doc, "static", staticJob, EXPECTED_STATIC_RUN, EXPECTED_RUN_CONDITION),
      ...staticMatrixViolations(doc, staticJob, scripts, staticParts),
      ...staticHistoryViolations(doc, staticJob),
    );
  }

  const testsJob = jobNode(doc, "tests");
  if (testsJob === undefined) {
    violations.push("verify.yml has no tests job");
  } else {
    for (const key of ["exclude", "include"]) {
      if (mapHas(doc, matrixNode(doc, testsJob), key)) {
        violations.push(`verify.yml's tests job strategy.matrix sets ${key}`);
      }
    }
    const shardValues = matrixShardValues(doc, testsJob);
    if (!isContiguousShardRange(shardValues)) {
      violations.push(
        "verify.yml's tests job strategy.matrix.shard is not a contiguous 1..n range covering every shard once",
      );
    } else {
      violations.push(
        ...runnerJobViolations(
          doc,
          "tests",
          testsJob,
          `pnpm verify:tests --shard=\${{ matrix.shard }}/${shardValues.length}`,
          EXPECTED_TESTS_CONDITION,
        ),
      );
    }
  }

  const visualJob = jobNode(doc, "visual");
  if (visualJob === undefined) {
    violations.push("verify.yml has no visual job");
  } else {
    violations.push(
      ...runnerJobViolations(
        doc,
        "visual",
        visualJob,
        "pnpm verify:visual",
        EXPECTED_VISUAL_CONDITION,
      ),
    );
  }

  const verifyJob = jobNode(doc, "verify");
  if (verifyJob === undefined) {
    violations.push("verify.yml has no verify job");
  } else {
    violations.push(...verifyJobViolations(doc, verifyJob));
  }

  if (scripts?.verify !== EXPECTED_VERIFY_SCRIPT) {
    violations.push(
      `package.json's "verify" script is "${scripts?.verify}", expected the exact composition "${EXPECTED_VERIFY_SCRIPT}"`,
    );
  }
  if (staticParts === null) {
    violations.push(
      `package.json's "verify:static" script is "${scripts?.["verify:static"]}", expected its parts as \`pnpm verify:static:<part>\` commands joined by &&`,
    );
  } else {
    violations.push(...staticPartsViolations(scripts, staticParts));
  }
  if (scripts?.["verify:tests"] !== EXPECTED_VERIFY_TESTS_SCRIPT) {
    violations.push(
      `package.json's "verify:tests" script is "${scripts?.["verify:tests"]}", expected exactly "${EXPECTED_VERIFY_TESTS_SCRIPT}"`,
    );
  }
  if (scripts?.["verify:visual"] !== EXPECTED_VERIFY_VISUAL_SCRIPT) {
    violations.push(
      `package.json's "verify:visual" script is "${scripts?.["verify:visual"]}", expected exactly "${EXPECTED_VERIFY_VISUAL_SCRIPT}"`,
    );
  }

  return violations;
}

// A reference whose first part is not a host (no dot, colon or localhost) names Docker Hub.
function comesFromDockerHub(image) {
  const [first, ...rest] = image.split("/");
  if (rest.length === 0) return true;
  const isHost = first.includes(".") || first.includes(":") || first === "localhost";
  return !isHost || DOCKER_HUB_HOSTS.has(first);
}

function declaredImage(setupSource, spec) {
  return new RegExp(`const ${spec.constant} =\\s*"([^"]+)";`).exec(setupSource)?.[1];
}

function testsStepIndex(doc, jobSteps, spec) {
  return jobSteps.findIndex((step) => {
    const run = resolveScalar(doc, mapGet(doc, step, "run"));
    return typeof run === "string" && run.trim().startsWith(`pnpm ${spec.testsScript}`);
  });
}

function isPullStepOf(doc, step, spec) {
  const run = resolveScalar(doc, mapGet(doc, step, "run"));
  return typeof run === "string" && run.trim() === pullWithRetriesCommand(spec);
}

// Testcontainers pulls an image the runner does not have yet with a single attempt, so a slow
// registry would fail the whole job; the job pulls it first, retrying.
function findPrePulledImageViolations(workflowSource, setupSource, spec) {
  const image = declaredImage(setupSource, spec);
  if (image === undefined) {
    return { violations: [`${spec.setupPath} declares no ${spec.constant}`] };
  }

  const violations = [];
  if (!/@sha256:[0-9a-f]{64}$/.test(image)) {
    violations.push(`${spec.label} \`${image}\` is not pinned by digest`);
  }
  if (!image.startsWith(`${spec.registry}/`)) {
    violations.push(
      `${spec.label} \`${image}\` is not on ${spec.registry}, the registry verify.yml signs in to with its own token`,
    );
  }

  const doc = parseDocument(workflowSource);
  const jobSteps = steps(doc, jobNode(doc, spec.job));
  const testsIndex = testsStepIndex(doc, jobSteps, spec);
  const pullStep = jobSteps
    .slice(0, Math.max(testsIndex, 0))
    .find((step) => isPullStepOf(doc, step, spec));

  const pullStepName = `verify.yml's ${spec.job} job pulls ${spec.label} in a step that`;
  if (pullStep === undefined) {
    violations.push(
      `verify.yml's ${spec.job} job has no step that pulls ${spec.label} with retries before its ${spec.testsScript} step`,
    );
  } else {
    const pulled = resolveScalar(doc, mapGet(doc, mapGet(doc, pullStep, "env"), spec.constant));
    if (pulled !== image) {
      violations.push(
        `verify.yml's ${spec.job} job pulls \`${pulled}\`, but ${spec.setupPath} starts \`${image}\``,
      );
    }
    if (mayContinueOnError(doc, pullStep)) {
      violations.push(`${pullStepName} sets continue-on-error`);
    }
    if (mapHas(doc, pullStep, "if")) {
      violations.push(`${pullStepName} has its own if`);
    }
    if (mapHas(doc, pullStep, "shell")) {
      violations.push(`${pullStepName} sets its own shell`);
    }
    if (!mapHas(doc, pullStep, "timeout-minutes")) {
      violations.push(
        `verify.yml's ${spec.job} job's pull step of ${spec.label} sets no timeout-minutes`,
      );
    }
  }

  // Ryuk is another image Testcontainers pulls from Docker Hub; a runner is discarded after its
  // job, so there is nothing left for it to clean up.
  const ryukDisabled = resolveScalar(
    doc,
    mapGet(doc, mapGet(doc, jobSteps[testsIndex], "env"), "TESTCONTAINERS_RYUK_DISABLED"),
  );
  if (String(ryukDisabled) !== "true") {
    violations.push(
      `verify.yml's ${spec.job} job's ${spec.testsScript} step does not set TESTCONTAINERS_RYUK_DISABLED to true`,
    );
  }
  return { image, violations, doc, jobSteps, pullStep };
}

function permissionsOf(doc, job) {
  const permissions = resolveNode(doc, mapGet(doc, job, "permissions"));
  if (!isMap(permissions)) return {};
  return Object.fromEntries(
    permissions.items.map((pair) => [
      String(resolveScalar(doc, pair.key)),
      resolveScalar(doc, pair.value),
    ]),
  );
}

function stepEnv(doc, step, name) {
  return resolveScalar(doc, mapGet(doc, mapGet(doc, step, "env"), name));
}

function digestOf(image) {
  return /@(sha256:[0-9a-f]{64})$/.exec(image)?.[1];
}

// A public registry caps what one address pulls without credentials (ECR Public) or stalls a layer
// (MCR), and shared runners share that address: the jobs pull from a copy on ghcr.io with the run's
// own token, and only a missing copy is ever pulled from the public registry, once.
function mirrorConsumerViolations(mirror, job, { doc, jobSteps, pullStep }) {
  const violations = [];
  const consumerJob = jobNode(doc, job);

  if (permissionsOf(doc, consumerJob).packages !== "read") {
    violations.push(
      `verify.yml's ${job} job is not granted packages: read, which signing in to ghcr.io needs`,
    );
  }
  const pullIndex = pullStep === undefined ? jobSteps.length : jobSteps.indexOf(pullStep);
  const signsIn = jobSteps.slice(0, pullIndex).some((step) => {
    const run = resolveScalar(doc, mapGet(doc, step, "run"));
    return (
      typeof run === "string" &&
      run.trim() === SIGN_IN_TO_GHCR_COMMAND &&
      stepEnv(doc, step, "GITHUB_TOKEN") === GITHUB_TOKEN_EXPRESSION
    );
  });
  if (!signsIn) {
    violations.push(
      `verify.yml's ${job} job does not sign in to ghcr.io with its own token before pulling ${mirror.label}`,
    );
  }
  const needs = neededJobs(doc, consumerJob);
  if (!needs.includes(mirror.lookupJob) || !needs.includes(mirror.copyJob)) {
    violations.push(
      `verify.yml's ${job} job does not wait for the ${mirror.lookupJob} and ${mirror.copyJob} jobs that put ${mirror.label} on ghcr.io`,
    );
  }
  return violations;
}

function mirrorJobsViolations(mirror, image, doc) {
  const violations = [];

  // A Dependabot run gets a read-only token whatever the workflow asks for, so the lookup must
  // need nothing more.
  const lookupJob = jobNode(doc, mirror.lookupJob);
  const lookupPermissions = permissionsOf(doc, lookupJob);
  if (Object.keys(lookupPermissions).length !== 1 || lookupPermissions.packages !== "read") {
    violations.push(
      `verify.yml's ${mirror.lookupJob} job must be granted only packages: read, so that a read-only token can look the copy up`,
    );
  }
  const lookupStep = stepRunningExactly(doc, lookupJob, lookUpMirrorCommand(mirror));
  if (
    lookupStep === undefined ||
    resolveScalar(doc, mapGet(doc, lookupStep, "id")) !== "mirror" ||
    stepEnv(doc, lookupStep, mirror.constant) !== image ||
    stepEnv(doc, lookupStep, "GITHUB_TOKEN") !== GITHUB_TOKEN_EXPRESSION ||
    resolveScalar(doc, mapGet(doc, mapGet(doc, lookupJob, "outputs"), "mirrored")) !==
      EXPECTED_MIRROR_OUTPUT
  ) {
    violations.push(
      `verify.yml's ${mirror.lookupJob} job does not look up \`${image}\` on ghcr.io and output whether it found it as mirrored`,
    );
  }

  const copyJob = jobNode(doc, mirror.copyJob);
  if (
    !neededJobs(doc, copyJob).includes(mirror.lookupJob) ||
    resolveScalar(doc, mapGet(doc, copyJob, "if")) !== expectedCopyCondition(mirror)
  ) {
    violations.push(
      `verify.yml's ${mirror.copyJob} job does not run only when ${mirror.lookupJob} did not find the copy (\`if: ${expectedCopyCondition(mirror)}\`)`,
    );
  }
  if (permissionsOf(doc, copyJob).packages !== "write") {
    violations.push(
      `verify.yml's ${mirror.copyJob} job is not granted packages: write, which copying to ghcr.io needs`,
    );
  }
  const copyStep = stepRunningExactly(doc, copyJob, copyMirrorCommand(mirror));
  if (
    copyStep === undefined ||
    stepEnv(doc, copyStep, mirror.constant) !== image ||
    stepEnv(doc, copyStep, "GITHUB_TOKEN") !== GITHUB_TOKEN_EXPRESSION
  ) {
    violations.push(
      `verify.yml's ${mirror.copyJob} job does not copy to \`${image}\` with its own token, retrying`,
    );
    return violations;
  }
  const source = String(stepEnv(doc, copyStep, "SOURCE_IMAGE"));
  if (digestOf(image) !== undefined && digestOf(source) !== digestOf(image)) {
    violations.push(
      `verify.yml's ${mirror.copyJob} job copies \`${source}\`, not the digest of \`${image}\``,
    );
  }
  if (comesFromDockerHub(source)) {
    violations.push(
      `verify.yml's ${mirror.copyJob} job copies \`${source}\` from Docker Hub, whose unauthenticated pulls a shared runner can exhaust`,
    );
  }
  return violations;
}

export function findCloudPostgresImageViolations(workflowSource, postgresSetupSource) {
  const found = findPrePulledImageViolations(
    workflowSource,
    postgresSetupSource,
    CLOUD_POSTGRES_IMAGE,
  );
  if (found.image === undefined) return found.violations;
  return [
    ...found.violations,
    ...mirrorConsumerViolations(CLOUD_POSTGRES_IMAGE, CLOUD_POSTGRES_IMAGE.job, found),
    ...mirrorJobsViolations(CLOUD_POSTGRES_IMAGE, found.image, found.doc),
  ];
}

export function findLocalPostgresImageViolations(composeSource, postgresSetupSource) {
  const image = declaredImage(postgresSetupSource, CLOUD_POSTGRES_IMAGE);
  const dbImage = parse(composeSource)?.services?.db?.image;
  if (image === undefined || dbImage === image) return [];
  return [
    `${COMPOSE_PATH}'s db service starts \`${dbImage}\`, but ${CLOUD_POSTGRES_IMAGE.setupPath} starts \`${image}\``,
  ];
}

export function findPlaywrightImageViolations(
  workflowSource,
  playwrightServerSetupSource,
  installedPlaywrightVersion,
  job,
) {
  const spec = PLAYWRIGHT_IMAGE_JOBS[job];
  const found = findPrePulledImageViolations(workflowSource, playwrightServerSetupSource, spec);
  const { image, violations } = found;
  if (image !== undefined) {
    violations.push(...mirrorConsumerViolations(PLAYWRIGHT_IMAGE, job, found));
    if (spec === PLAYWRIGHT_IMAGE_JOBS.tests) {
      violations.push(...mirrorJobsViolations(PLAYWRIGHT_IMAGE, image, found.doc));
    }
  }
  if (image !== undefined && !image.includes(`:v${installedPlaywrightVersion}-`)) {
    violations.push(
      `${spec.label} \`${image}\` is not the installed Playwright version ${installedPlaywrightVersion}`,
    );
  }
  return violations;
}

export function findPrePulledJobTimeoutViolations(workflowSource) {
  const doc = parseDocument(workflowSource);
  const violations = [];
  for (const jobId of new Set(PRE_PULLED_IMAGES.map((spec) => spec.job))) {
    const job = jobNode(doc, jobId);
    const pulled = PRE_PULLED_IMAGES.filter((spec) => spec.job === jobId);
    const jobSteps = steps(doc, job);
    const testsIndex = testsStepIndex(doc, jobSteps, pulled[0]);
    if (testsIndex === -1) continue;
    const testsStep = jobSteps[testsIndex];
    const testsScript = pulled[0].testsScript;
    if (!mapHas(doc, testsStep, "timeout-minutes")) {
      violations.push(`verify.yml's ${jobId} job's ${testsScript} step sets no timeout-minutes`);
      continue;
    }
    if (!mapHas(doc, job, "timeout-minutes")) continue;
    const pullSeconds = pulled
      .filter((spec) => jobSteps.some((step) => isPullStepOf(doc, step, spec)))
      .reduce((total, spec) => total + retrySeconds(spec.pullAttemptSeconds), 0);
    const neededSeconds =
      pullSeconds + Number(resolveScalar(doc, mapGet(doc, testsStep, "timeout-minutes"))) * 60;
    const jobMinutes = resolveScalar(doc, mapGet(doc, job, "timeout-minutes"));
    if (!(Number(jobMinutes) * 60 >= neededSeconds)) {
      violations.push(
        `verify.yml's ${jobId} job allows ${jobMinutes} minutes, less than the ${neededSeconds} seconds its image pulls and its ${testsScript} step can take`,
      );
    }
  }
  return violations;
}

export function findPlaywrightInstallViolations(workflowSource) {
  const doc = parseDocument(workflowSource);
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  if (!isMap(jobsNode)) return [];

  const violations = [];
  for (const jobPair of jobsNode.items) {
    const jobId = String(resolveScalar(doc, jobPair.key));
    for (const step of steps(doc, resolveNode(doc, jobPair.value))) {
      const run = resolveScalar(doc, mapGet(doc, step, "run"));
      if (typeof run === "string" && /\bplaywright(?:-core)?(?:@\S+)?\s+install/.test(run)) {
        violations.push(
          `verify.yml's ${jobId} job installs a Playwright browser or its system packages at CI time (\`${run.trim()}\`); an apt mirror can stall the step silently, and the browsers come from the pinned Playwright image`,
        );
      }
    }
  }
  return violations;
}

function downloadsArtifacts(doc, step) {
  const run = resolveScalar(doc, mapGet(doc, step, "run"));
  const uses = resolveScalar(doc, mapGet(doc, step, "uses"));
  return (
    (typeof run === "string" && /\bgh\s+run\s+download\b/.test(run)) ||
    (typeof uses === "string" && uses.startsWith("actions/download-artifact@"))
  );
}

export function findShardDownloadViolations(workflowSource) {
  const doc = parseDocument(workflowSource);
  const jobsNode = resolveNode(doc, doc.get("jobs", true));
  if (!isMap(jobsNode)) return [];

  const violations = [];
  for (const jobPair of jobsNode.items) {
    const jobId = String(resolveScalar(doc, jobPair.key));
    const job = resolveNode(doc, jobPair.value);
    if (matrixNode(doc, job) === undefined) continue;
    if (steps(doc, job).some((step) => downloadsArtifacts(doc, step))) {
      violations.push(
        `verify.yml's ${jobId} job downloads artifacts in each of its matrix jobs; a download can fail in one and succeed in another, so they would work from different inputs. Download once in a job they need and hand them its output`,
      );
    }
  }
  return violations;
}

export function checkRepository({
  readFile = (path) => readFileSync(path, "utf8"),
  workflowPath = WORKFLOW_PATH,
  packageJsonPath = PACKAGE_JSON_PATH,
} = {}) {
  const workflowSource = readFile(workflowPath);
  const installedPlaywrightVersion = JSON.parse(
    readFile(INSTALLED_PLAYWRIGHT_PACKAGE_JSON_PATH),
  ).version;
  const playwrightServerSetupSource = readFile(PLAYWRIGHT_IMAGE.setupPath);
  const postgresSetupSource = readFile(CLOUD_POSTGRES_IMAGE.setupPath);
  return [
    ...findVerifyWorkflowViolations(workflowSource, readFile(packageJsonPath)),
    ...findCloudPostgresImageViolations(workflowSource, postgresSetupSource),
    ...findLocalPostgresImageViolations(readFile(COMPOSE_PATH), postgresSetupSource),
    ...Object.keys(PLAYWRIGHT_IMAGE_JOBS).flatMap((job) =>
      findPlaywrightImageViolations(
        workflowSource,
        playwrightServerSetupSource,
        installedPlaywrightVersion,
        job,
      ),
    ),
    ...findPrePulledJobTimeoutViolations(workflowSource),
    ...findPlaywrightInstallViolations(workflowSource),
    ...findShardDownloadViolations(workflowSource),
  ];
}
