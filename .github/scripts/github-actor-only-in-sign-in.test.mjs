import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkFiles,
  describeViolation,
  findActorViolations,
  findWorkflowFiles,
} from "./github-actor-only-in-sign-in.mjs";

function workflow(...lines) {
  return lines.join("\n");
}

function linesOf(source) {
  return findActorViolations(source).map((violation) => violation.line);
}

test("refuses github.actor in a workflow-level env: value", () => {
  const source = workflow(
    "env:",
    "  REQUESTER: ${{ github.actor }}",
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: echo hi",
  );

  assert.deepEqual(linesOf(source), [2]);
});

test("refuses github.actor in a job-level env: value", () => {
  const source = workflow(
    "jobs:",
    "  build:",
    "    env:",
    "      REQUESTER: ${{ github.actor }}",
    "    steps:",
    "      - run: echo hi",
  );

  assert.deepEqual(linesOf(source), [4]);
});

test("refuses github.actor in a step-level env: value", () => {
  const source = workflow(
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: ./release.sh",
    "        env:",
    "          REQUESTER: ${{ github.actor }}",
  );

  assert.deepEqual(linesOf(source), [6]);
});

test("refuses github.actor in a job if: condition written without ${{ }}", () => {
  const source = workflow(
    "jobs:",
    "  release:",
    "    if: github.actor == 'owner'",
    "    steps:",
    "      - run: echo hi",
  );

  assert.deepEqual(linesOf(source), [3]);
});

test("refuses github.actor in a step if: condition written with ${{ }}", () => {
  const source = workflow(
    "jobs:",
    "  release:",
    "    steps:",
    "      - if: ${{ github.actor == 'owner' }}",
    "        run: echo hi",
  );

  assert.deepEqual(linesOf(source), [4]);
});

test("refuses github.actor in a with: input other than a sign-in username", () => {
  const source = workflow(
    "jobs:",
    "  notify:",
    "    steps:",
    "      - uses: some/notify-action@SHA1",
    "        with:",
    "          requester: ${{ github.actor }}",
  );

  assert.deepEqual(linesOf(source), [6]);
});

test("refuses github.actor as the username: input of an action that is not a login action", () => {
  const source = workflow(
    "jobs:",
    "  notify:",
    "    steps:",
    "      - uses: some/notify-action@SHA1",
    "        with:",
    "          username: ${{ github.actor }}",
  );

  assert.deepEqual(linesOf(source), [6]);
});

test("accepts github.actor as the username: input of a login action", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    "      - uses: docker/login-action@SHA1",
    "        with:",
    "          registry: ghcr.io",
    "          username: ${{ github.actor }}",
    "          password: ${{ secrets.GITHUB_TOKEN }}",
  );

  assert.deepEqual(linesOf(source), []);
});

test("refuses github.actor in a login action's input other than username:", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    "      - uses: docker/login-action@SHA1",
    "        with:",
    "          registry: ghcr.io/${{ github.actor }}",
    "          username: ${{ github.actor }}",
  );

  assert.deepEqual(linesOf(source), [6]);
});

test("accepts $GITHUB_ACTOR as the --username of docker login", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    '      - run: echo "$GITHUB_TOKEN" | docker login ghcr.io --username "$GITHUB_ACTOR" --password-stdin',
  );

  assert.deepEqual(linesOf(source), []);
});

test("accepts $GITHUB_ACTOR as the --username of skopeo login inside a longer script", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    "      - run: |",
    "          set -euo pipefail",
    '          echo "$GITHUB_TOKEN" | skopeo login ghcr.io --username "$GITHUB_ACTOR" --password-stdin',
    "          skopeo copy docker://a docker://b",
  );

  assert.deepEqual(linesOf(source), []);
});

test("accepts the short -u option, the =-joined form, ${GITHUB_ACTOR} and ${{ github.actor }} in a sign-in command", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    "      - run: |",
    '          echo "$T" | docker login ghcr.io -u "${GITHUB_ACTOR}" --password-stdin',
    '          echo "$T" | skopeo login ghcr.io --username=$GITHUB_ACTOR --password-stdin',
    '          echo "$T" | docker login ghcr.io --username ${{ github.actor }} --password-stdin',
  );

  assert.deepEqual(linesOf(source), []);
});

test("accepts a sign-in command continued over several lines", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    "      - run: |",
    '          echo "$GITHUB_TOKEN" | docker login ghcr.io \\',
    '            --username "$GITHUB_ACTOR" \\',
    "            --password-stdin",
  );

  assert.deepEqual(linesOf(source), []);
});

test("refuses $GITHUB_ACTOR in a run script outside a sign-in command, on its own line", () => {
  const source = workflow(
    "jobs:",
    "  release:",
    "    steps:",
    "      - run: |",
    "          set -euo pipefail",
    '          if [ "$GITHUB_ACTOR" != owner ]; then exit 1; fi',
  );

  assert.deepEqual(linesOf(source), [6]);
});

test("refuses ${{ github.actor }} in a run script outside a sign-in command", () => {
  const source = workflow(
    "jobs:",
    "  release:",
    "    steps:",
    '      - run: ./check-admin.sh "${{ github.actor }}"',
  );

  assert.deepEqual(linesOf(source), [4]);
});

test("refuses $GITHUB_ACTOR copied into another variable before a sign-in command", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    "      - run: |",
    '          REGISTRY_USER="$GITHUB_ACTOR"',
    '          echo "$T" | docker login ghcr.io --username "$REGISTRY_USER" --password-stdin',
  );

  assert.deepEqual(linesOf(source), [5]);
});

test("refuses $GITHUB_ACTOR in a sign-in command anywhere but its username", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    '      - run: echo "$T" | docker login "ghcr.io/$GITHUB_ACTOR" --username "$GITHUB_ACTOR" --password-stdin',
  );

  assert.deepEqual(linesOf(source), [4]);
});

test("refuses $GITHUB_ACTOR chained after a sign-in command on the same line", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    '      - run: docker login ghcr.io --username "$GITHUB_ACTOR" --password-stdin < t && ./admin.sh "$GITHUB_ACTOR"',
  );

  assert.deepEqual(linesOf(source), [4]);
});

test("refuses $GITHUB_ACTOR as the username of a command that is not a registry sign-in", () => {
  const source = workflow(
    "jobs:",
    "  release:",
    "    steps:",
    '      - run: ./deploy.sh --username "$GITHUB_ACTOR"',
  );

  assert.deepEqual(linesOf(source), [4]);
});

test("refuses spacing and case variants of the expression", () => {
  const source = workflow(
    "env:",
    "  A: ${{github.actor}}",
    "  B: ${{   github.actor   }}",
    "  C: ${{ GitHub.Actor }}",
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: echo hi",
  );

  assert.deepEqual(linesOf(source), [2, 3, 4]);
});

test("refuses bracket notation", () => {
  const source = workflow(
    "env:",
    "  A: ${{ github['actor'] }}",
    "jobs:",
    "  build:",
    "    if: github[ 'actor' ] == 'owner'",
    "    steps:",
    "      - run: echo hi",
  );

  assert.deepEqual(linesOf(source), [2, 5]);
});

test("refuses github.actor embedded in a larger expression", () => {
  const source = workflow(
    "env:",
    "  A: ${{ format('requested by {0}', github.actor) }}",
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: echo hi",
  );

  assert.deepEqual(linesOf(source), [2]);
});

test("refuses a sign-in username reached through a YAML alias outside the sign-in", () => {
  const source = workflow(
    "jobs:",
    "  publish:",
    "    steps:",
    "      - uses: docker/login-action@SHA1",
    "        with:",
    "          username: &user ${{ github.actor }}",
    "      - run: ./admin.sh",
    "        env:",
    "          REQUESTER: *user",
  );

  assert.deepEqual(linesOf(source), [9]);
});

test("refuses an aliased env: map that reads github.actor wherever it is used", () => {
  const source = workflow(
    "jobs:",
    "  build:",
    "    steps:",
    "      - run: echo hi",
    "        env: &who",
    "          REQUESTER: ${{ github.actor }}",
    "      - run: echo again",
    "        env: *who",
  );

  assert.deepEqual(linesOf(source), [6, 8]);
});

test("accepts github.triggering_actor in env:, if: and run:", () => {
  const source = workflow(
    "env:",
    "  ACTOR: ${{ github.triggering_actor }}",
    "jobs:",
    "  release:",
    "    if: github.triggering_actor == 'owner'",
    "    steps:",
    '      - run: ./check-admin.sh "$GITHUB_TRIGGERING_ACTOR" "${{ github.triggering_actor }}"',
  );

  assert.deepEqual(linesOf(source), []);
});

test("refuses github.actor_id and GITHUB_ACTOR_ID everywhere, a sign-in included", () => {
  const source = workflow(
    "env:",
    "  A: ${{ github.actor_id }}",
    "  B: ${{ github['actor_id'] }}",
    "jobs:",
    "  build:",
    "    if: github.actor_id == '1'",
    "    steps:",
    '      - run: echo "$GITHUB_ACTOR_ID"',
    "      - uses: docker/login-action@SHA1",
    "        with:",
    "          username: ${{ github.actor_id }}",
    '      - run: echo "$T" | docker login ghcr.io --username "$GITHUB_ACTOR_ID" --password-stdin',
  );

  assert.deepEqual(linesOf(source), [2, 3, 6, 8, 11, 12]);
});

test("ignores other names that only start like GITHUB_ACTOR", () => {
  const source = workflow(
    "jobs:",
    "  build:",
    "    steps:",
    '      - run: echo "$GITHUB_ACTORS_FILE" "${{ github.actors }}"',
  );

  assert.deepEqual(linesOf(source), []);
});

test("reports a workflow that does not parse as YAML instead of scanning it silently", () => {
  const files = {
    "broken.yml": workflow("jobs:", "  build:", "    steps:", '      - run: "echo'),
  };

  const violations = checkFiles(Object.keys(files), (path) => files[path]);

  assert.equal(violations.length, 1);
  assert.equal(violations[0].path, "broken.yml");
  assert.match(violations[0].message, /does not parse as YAML/);
});

test("names the workflow and the line, and points to github.triggering_actor", () => {
  const files = {
    "release.yml": workflow(
      "jobs:",
      "  release:",
      "    if: github.actor == 'owner'",
      "    steps:",
      "      - run: echo hi",
    ),
  };

  const [description] = checkFiles(Object.keys(files), (path) => files[path]).map(
    describeViolation,
  );

  assert.match(description, /^release\.yml:3: /);
  assert.match(description, /use github\.triggering_actor when the value decides who may act/);
});

test("no workflow reads github.actor outside a registry sign-in username", () => {
  const files = findWorkflowFiles();
  assert.ok(files.length > 0, "expected to find at least one workflow file to scan");

  const violations = checkFiles(files);

  assert.deepEqual(
    violations.map(describeViolation),
    [],
    "github.actor keeps naming the run's first trigger when someone else re-runs it; " +
      "use github.triggering_actor when the value decides who may act.",
  );
});
