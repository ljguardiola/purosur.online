import assert from "node:assert/strict";
import { test } from "node:test";
import { raiseBudgetOnPullRequest, readMeasurement } from "./dependabot-budget-raise.mjs";

const BUDGET_PATH = "apps/backoffice/download-budget.json";
const HEAD_SHA = "a".repeat(40);
const BRANCH = "dependabot/npm_and_yarn/lucide-react-1.2.3";

const dependabotPullRequest = {
  number: 2202,
  state: "open",
  user: { login: "dependabot[bot]", type: "Bot" },
  head: { sha: HEAD_SHA, ref: BRANCH, repo: { full_name: "owner/repo" } },
};

function fakeGitHub({
  pullRequests = [dependabotPullRequest],
  budget = { entry: 100_000, total: 400_000 },
} = {}) {
  const calls = [];
  const encoded = Buffer.from(`${JSON.stringify(budget, null, 2)}\n`).toString("base64");
  const reader = {
    pulls: {
      list: async (params) => {
        calls.push(["pulls.list", params]);
        return { data: pullRequests };
      },
    },
    repos: {
      getContent: async (params) => {
        calls.push(["repos.getContent", params]);
        return { data: { type: "file", encoding: "base64", content: encoded } };
      },
    },
  };
  const writer = {
    git: {
      getCommit: async (params) => {
        calls.push(["git.getCommit", params]);
        return { data: { tree: { sha: "tree-of-head" } } };
      },
      createTree: async (params) => {
        calls.push(["git.createTree", params]);
        return { data: { sha: "new-tree" } };
      },
      createCommit: async (params) => {
        calls.push(["git.createCommit", params]);
        return { data: { sha: "new-commit" } };
      },
      updateRef: async (params) => {
        calls.push(["git.updateRef", params]);
        return { data: {} };
      },
    },
  };
  return { reader, writer, calls };
}

const run = { head_sha: HEAD_SHA, head_branch: BRANCH };
const measurementText = (measured) => JSON.stringify({ missing: [], ...measured });

async function raise({
  github = fakeGitHub(),
  measured = { entry: 100_019, total: 400_105 },
} = {}) {
  const outcome = await raiseBudgetOnPullRequest({
    reader: github.reader,
    writer: github.writer,
    owner: "owner",
    repo: "repo",
    run,
    measurementText: measurementText(measured),
  });
  return { outcome, calls: github.calls };
}

const writes = (calls) => calls.filter(([name]) => name.startsWith("git."));

test("raiseBudgetOnPullRequest commits the measured sizes as the budget on the pull request's branch, on top of the measured commit", async () => {
  const { outcome, calls } = await raise();

  assert.deepEqual(outcome, {
    kind: "raised",
    pullRequest: 2202,
    budget: { entry: 100_019, total: 400_105 },
  });
  const tree = calls.find(([name]) => name === "git.createTree")[1];
  assert.equal(tree.base_tree, "tree-of-head");
  assert.deepEqual(tree.tree, [
    {
      path: BUDGET_PATH,
      mode: "100644",
      type: "blob",
      content: `${JSON.stringify({ entry: 100_019, total: 400_105 }, null, 2)}\n`,
    },
  ]);
  const commit = calls.find(([name]) => name === "git.createCommit")[1];
  assert.deepEqual(commit.parents, [HEAD_SHA]);
  assert.equal(commit.tree, "new-tree");
  assert.match(commit.message, /^chore\(deps\): /);
  const ref = calls.find(([name]) => name === "git.updateRef")[1];
  assert.deepEqual(ref, {
    owner: "owner",
    repo: "repo",
    ref: `heads/${BRANCH}`,
    sha: "new-commit",
    force: false,
  });
});

test("raiseBudgetOnPullRequest reads the budget the measured commit holds", async () => {
  const { calls } = await raise();

  const read = calls.find(([name]) => name === "repos.getContent")[1];
  assert.deepEqual(read, { owner: "owner", repo: "repo", path: BUDGET_PATH, ref: HEAD_SHA });
});

test("raiseBudgetOnPullRequest looks the pull request up by its branch in this repository", async () => {
  const { calls } = await raise();

  const list = calls.find(([name]) => name === "pulls.list")[1];
  assert.deepEqual(list, { owner: "owner", repo: "repo", head: `owner:${BRANCH}`, state: "open" });
});

test("raiseBudgetOnPullRequest commits nothing when the bundle fits the budget", async () => {
  const { outcome, calls } = await raise({ measured: { entry: 100_000, total: 400_000 } });

  assert.equal(outcome.kind, "within-budget");
  assert.deepEqual(writes(calls), []);
});

test("raiseBudgetOnPullRequest commits nothing when the bundle grew by more than 2 KB", async () => {
  const { outcome, calls } = await raise({ measured: { entry: 100_000, total: 402_049 } });

  assert.equal(outcome.kind, "over-cap");
  assert.deepEqual(writes(calls), []);
});

for (const [description, user] of [
  ["a person", { login: "someone", type: "User" }],
  ["a user named like Dependabot", { login: "dependabot[bot]", type: "User" }],
]) {
  test(`raiseBudgetOnPullRequest commits nothing on a pull request opened by ${description}`, async () => {
    const github = fakeGitHub({ pullRequests: [{ ...dependabotPullRequest, user }] });

    const { outcome, calls } = await raise({ github });

    assert.equal(outcome.kind, "not-dependabot");
    assert.deepEqual(writes(calls), []);
  });
}

test("raiseBudgetOnPullRequest commits nothing when the branch moved past the measured commit", async () => {
  const github = fakeGitHub({
    pullRequests: [
      { ...dependabotPullRequest, head: { ...dependabotPullRequest.head, sha: "b".repeat(40) } },
    ],
  });

  const { outcome, calls } = await raise({ github });

  assert.equal(outcome.kind, "stale");
  assert.deepEqual(writes(calls), []);
});

test("raiseBudgetOnPullRequest commits nothing when no open pull request has the branch", async () => {
  const { outcome, calls } = await raise({ github: fakeGitHub({ pullRequests: [] }) });

  assert.equal(outcome.kind, "no-pull-request");
  assert.deepEqual(writes(calls), []);
});

test("raiseBudgetOnPullRequest commits nothing when the measurement cannot be read", async () => {
  const github = fakeGitHub();

  const outcome = await raiseBudgetOnPullRequest({
    reader: github.reader,
    writer: github.writer,
    owner: "owner",
    repo: "repo",
    run,
    measurementText: "not json",
  });

  assert.equal(outcome.kind, "unreadable-measurement");
  assert.deepEqual(github.calls, []);
});

test("readMeasurement reads the sizes and the missing files", () => {
  assert.deepEqual(readMeasurement('{"entry":1,"total":2,"missing":["a.js"]}'), {
    entry: 1,
    total: 2,
    missing: ["a.js"],
  });
});

for (const [description, text] of [
  ["is not JSON", "{"],
  ["lacks a size", '{"entry":1,"missing":[]}'],
  ["holds a size that is not a whole number", '{"entry":1.5,"total":2,"missing":[]}'],
  ["holds a size that is not positive", '{"entry":0,"total":2,"missing":[]}'],
  ["holds a size written as text", '{"entry":"1","total":2,"missing":[]}'],
  ["holds missing files that are not a list of names", '{"entry":1,"total":2,"missing":[3]}'],
  ["holds another field", '{"entry":1,"total":2,"missing":[],"budget":5}'],
  ["is a list", "[1,2]"],
]) {
  test(`readMeasurement refuses a measurement that ${description}`, () => {
    assert.equal(readMeasurement(text), null);
  });
}
