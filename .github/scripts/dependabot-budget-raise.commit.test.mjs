import assert from "node:assert/strict";
import { test } from "node:test";
import { raiseBudgetOnPullRequest } from "./dependabot-budget-raise.mjs";

const BUDGET_PATH = "apps/backoffice/download-budget.json";
const HEAD_SHA = "a".repeat(40);
const BRANCH = "dependabot/npm_and_yarn/lucide-react-1.2.3";
const DEFAULT_BRANCH = "main";
const MERGE_BASE_SHA = "c".repeat(40);
const BUDGET = { entry: 100_000, total: 400_000 };

const dependabotPullRequest = {
  number: 2202,
  state: "open",
  user: { login: "dependabot[bot]", type: "Bot" },
  head: { sha: HEAD_SHA, ref: BRANCH, repo: { full_name: "owner/repo" } },
};

function fakeGitHub({
  pullRequests = [dependabotPullRequest],
  budgets = {},
  mergeError = null,
  mergeStatus = 201,
} = {}) {
  const budgetAt = {
    [HEAD_SHA]: BUDGET,
    [DEFAULT_BRANCH]: BUDGET,
    [MERGE_BASE_SHA]: BUDGET,
    ...budgets,
  };
  const calls = [];
  const encoded = (budget) =>
    Buffer.from(`${JSON.stringify(budget, null, 2)}\n`).toString("base64");
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
        return {
          data: { type: "file", encoding: "base64", content: encoded(budgetAt[params.ref]) },
        };
      },
      compareCommitsWithBasehead: async (params) => {
        calls.push(["repos.compareCommitsWithBasehead", params]);
        return { data: { merge_base_commit: { sha: MERGE_BASE_SHA } } };
      },
    },
  };
  const writer = {
    repos: {
      merge: async (params) => {
        calls.push(["repos.merge", params]);
        if (mergeError !== null) throw mergeError;
        return mergeStatus === 204
          ? { status: 204, data: "" }
          : { status: mergeStatus, data: { sha: "merge-commit" } };
      },
    },
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
    baseBranch: DEFAULT_BRANCH,
    run,
    measurementText: measurementText(measured),
  });
  return { outcome, calls: github.calls };
}

const writes = (calls) =>
  calls.filter(([name]) => name.startsWith("git.") || name === "repos.merge");
const gitWrites = (calls) => calls.filter(([name]) => name.startsWith("git."));
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
const budgetOf = (total) => ({ entry: 100_000, total });
const DEFAULT_BRANCH_RAISED = { [DEFAULT_BRANCH]: budgetOf(401_500) };
const OWN_RAISE = { [HEAD_SHA]: budgetOf(400_500) };

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

test("raiseBudgetOnPullRequest finds where the branch left the default branch", async () => {
  const { calls } = await raise();

  const compares = calls
    .filter(([name]) => name === "repos.compareCommitsWithBasehead")
    .map(([, params]) => params);
  assert.deepEqual(compares, [
    { owner: "owner", repo: "repo", basehead: `${DEFAULT_BRANCH}...${HEAD_SHA}` },
  ]);
});

test("raiseBudgetOnPullRequest reads the budget the measured commit, the default branch and their merge base hold", async () => {
  const { calls } = await raise();

  const reads = calls.filter(([name]) => name === "repos.getContent").map(([, params]) => params);
  assert.deepEqual(
    reads.toSorted((a, b) => a.ref.localeCompare(b.ref)),
    [
      { owner: "owner", repo: "repo", path: BUDGET_PATH, ref: HEAD_SHA },
      { owner: "owner", repo: "repo", path: BUDGET_PATH, ref: MERGE_BASE_SHA },
      { owner: "owner", repo: "repo", path: BUDGET_PATH, ref: DEFAULT_BRANCH },
    ],
  );
});

for (const [description, measuredTotal] of [
  ["shrank", 399_000],
  ["grew within the default branch's raised budget", 400_105],
]) {
  test(`raiseBudgetOnPullRequest writes nothing when the bundle ${description} while the default branch raised the budget`, async () => {
    const github = fakeGitHub({ budgets: DEFAULT_BRANCH_RAISED });

    const { outcome, calls } = await raise({
      github,
      measured: { entry: 100_000, total: measuredTotal },
    });

    assert.equal(outcome.kind, "within-budget");
    assert.deepEqual(writes(calls), []);
  });
}

test("raiseBudgetOnPullRequest writes nothing when the bundle fits the budget the branch already raised", async () => {
  const github = fakeGitHub({ budgets: OWN_RAISE });

  const { outcome, calls } = await raise({ github, measured: { entry: 100_000, total: 400_500 } });

  assert.equal(outcome.kind, "within-budget");
  assert.deepEqual(writes(calls), []);
});

test("raiseBudgetOnPullRequest raises again on the branch, over the budget it already raised, when the bundle grew within 2 KB of it", async () => {
  const github = fakeGitHub({ budgets: OWN_RAISE });

  const { outcome, calls } = await raise({ github, measured: { entry: 100_000, total: 402_548 } });

  assert.deepEqual(outcome, { kind: "raised", pullRequest: 2202, budget: budgetOf(402_548) });
  assert.deepEqual(
    calls.filter(([name]) => name === "repos.merge"),
    [],
  );
  const commit = calls.find(([name]) => name === "git.createCommit")[1];
  assert.deepEqual(commit.parents, [HEAD_SHA]);
});

for (const [description, defaultBranchTotal, measuredTotal] of [
  ["raised", 401_500, 401_600],
  ["lowered", 399_000, 400_105],
]) {
  test(`raiseBudgetOnPullRequest merges the default branch into the pull request's branch, committing no budget, when the default branch ${description} the budget since the branch was cut and the bundle outgrew it`, async () => {
    const github = fakeGitHub({ budgets: { [DEFAULT_BRANCH]: budgetOf(defaultBranchTotal) } });

    const { outcome, calls } = await raise({
      github,
      measured: { entry: 100_000, total: measuredTotal },
    });

    assert.deepEqual(outcome, { kind: "merged-default-branch", pullRequest: 2202 });
    const merges = calls.filter(([name]) => name === "repos.merge").map(([, params]) => params);
    assert.equal(merges.length, 1);
    assert.equal(merges[0].owner, "owner");
    assert.equal(merges[0].repo, "repo");
    assert.equal(merges[0].base, BRANCH);
    assert.equal(merges[0].head, DEFAULT_BRANCH);
    assert.match(merges[0].commit_message, /^chore\(deps\): /);
    assert.deepEqual(gitWrites(calls), []);
  });
}

test("raiseBudgetOnPullRequest merges the default branch when both raised the budget alike since the branch was cut and the bundle outgrew it", async () => {
  const github = fakeGitHub({
    budgets: { [HEAD_SHA]: budgetOf(401_500), [DEFAULT_BRANCH]: budgetOf(401_500) },
  });

  const { outcome, calls } = await raise({ github, measured: { entry: 100_000, total: 401_600 } });

  assert.deepEqual(outcome, { kind: "merged-default-branch", pullRequest: 2202 });
  assert.deepEqual(gitWrites(calls), []);
});

test("raiseBudgetOnPullRequest writes nothing when the branch and the default branch changed the budget differently since the branch was cut", async () => {
  const github = fakeGitHub({ budgets: { ...OWN_RAISE, ...DEFAULT_BRANCH_RAISED } });

  const { outcome, calls } = await raise({ github, measured: { entry: 100_000, total: 401_600 } });

  assert.deepEqual(outcome, { kind: "budget-conflict", pullRequest: 2202 });
  assert.deepEqual(writes(calls), []);
});

test("raiseBudgetOnPullRequest reports nothing to merge when the branch already holds the default branch", async () => {
  const github = fakeGitHub({ budgets: DEFAULT_BRANCH_RAISED, mergeStatus: 204 });

  const { outcome, calls } = await raise({ github, measured: { entry: 100_000, total: 401_600 } });

  assert.deepEqual(outcome, { kind: "nothing-to-merge", pullRequest: 2202 });
  assert.deepEqual(gitWrites(calls), []);
});

test("raiseBudgetOnPullRequest commits nothing when the default branch cannot be merged into the pull request's branch without a conflict", async () => {
  const github = fakeGitHub({ budgets: DEFAULT_BRANCH_RAISED, mergeError: httpError(409) });

  const { outcome, calls } = await raise({ github, measured: { entry: 100_000, total: 401_600 } });

  assert.deepEqual(outcome, { kind: "merge-conflict", pullRequest: 2202 });
  assert.deepEqual(gitWrites(calls), []);
});

test("raiseBudgetOnPullRequest fails when merging the default branch fails for any reason but a conflict", async () => {
  const github = fakeGitHub({ budgets: DEFAULT_BRANCH_RAISED, mergeError: httpError(403) });

  await assert.rejects(raise({ github, measured: { entry: 100_000, total: 401_600 } }), {
    status: 403,
  });
  assert.deepEqual(gitWrites(github.calls), []);
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
    baseBranch: DEFAULT_BRANCH,
    run,
    measurementText: "not json",
  });

  assert.equal(outcome.kind, "unreadable-measurement");
  assert.deepEqual(github.calls, []);
});
