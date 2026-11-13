import { findBudgetViolations, holdsExactlyTheMeasures } from "./download-budget-rules.mjs";
import { isDependabotAuthor } from "./validate-pr.mjs";

const RAISE_CAP_BYTES = 2048;
const BUDGET_PATH = "apps/backoffice/download-budget.json";
const MEASUREMENT_FIELDS = ["entry", "total", "missing"];

export function decideBudgetRaise(measured, budget) {
  if (!holdsExactlyTheMeasures(budget) || measured.missing.length > 0) {
    return { kind: "refused", reasons: findBudgetViolations(measured, budget) };
  }
  if (findBudgetViolations(measured, budget).length === 0) return { kind: "within-budget" };

  const cap = { entry: budget.entry + RAISE_CAP_BYTES, total: budget.total + RAISE_CAP_BYTES };
  const overCap = findBudgetViolations(measured, cap);
  if (overCap.length > 0) return { kind: "over-cap", reasons: overCap };

  return { kind: "raise", budget: { entry: measured.entry, total: measured.total } };
}

export function readMeasurement(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== MEASUREMENT_FIELDS.length) return null;
  if (!MEASUREMENT_FIELDS.every((field) => Object.hasOwn(value, field))) return null;
  if (!holdsExactlyTheMeasures({ entry: value.entry, total: value.total })) return null;
  if (!Array.isArray(value.missing) || !value.missing.every((file) => typeof file === "string")) {
    return null;
  }
  return { entry: value.entry, total: value.total, missing: value.missing };
}

const budgetFileContent = (budget) => `${JSON.stringify(budget, null, 2)}\n`;

async function readBudgetText({ reader, owner, repo, ref }) {
  const { data: file } = await reader.repos.getContent({ owner, repo, path: BUDGET_PATH, ref });
  return Buffer.from(file.content, file.encoding).toString("utf8");
}

export async function raiseBudgetOnPullRequest({
  reader,
  writer,
  owner,
  repo,
  baseBranch,
  run,
  measurementText,
}) {
  const measured = readMeasurement(measurementText);
  if (measured === null) return { kind: "unreadable-measurement" };

  const { data: pullRequests } = await reader.pulls.list({
    owner,
    repo,
    head: `${owner}:${run.head_branch}`,
    state: "open",
  });
  if (pullRequests.length !== 1) return { kind: "no-pull-request" };
  const [pullRequest] = pullRequests;
  if (!isDependabotAuthor({ login: pullRequest.user?.login, type: pullRequest.user?.type })) {
    return { kind: "not-dependabot", pullRequest: pullRequest.number };
  }
  if (pullRequest.head.sha !== run.head_sha)
    return { kind: "stale", pullRequest: pullRequest.number };

  const [headBudgetText, baseBudgetText] = await Promise.all([
    readBudgetText({ reader, owner, repo, ref: run.head_sha }),
    readBudgetText({ reader, owner, repo, ref: baseBranch }),
  ]);
  if (headBudgetText !== baseBudgetText) {
    return { kind: "budget-diverged", pullRequest: pullRequest.number };
  }
  const budget = JSON.parse(headBudgetText);

  const decision = decideBudgetRaise(measured, budget);
  if (decision.kind !== "raise") return { ...decision, pullRequest: pullRequest.number };

  const { data: headCommit } = await writer.git.getCommit({
    owner,
    repo,
    commit_sha: run.head_sha,
  });
  const { data: tree } = await writer.git.createTree({
    owner,
    repo,
    base_tree: headCommit.tree.sha,
    tree: [
      {
        path: BUDGET_PATH,
        mode: "100644",
        type: "blob",
        content: budgetFileContent(decision.budget),
      },
    ],
  });
  const { data: commit } = await writer.git.createCommit({
    owner,
    repo,
    message: "chore(deps): raise the backoffice download budget to the measured bundle",
    tree: tree.sha,
    parents: [run.head_sha],
  });
  await writer.git.updateRef({
    owner,
    repo,
    ref: `heads/${run.head_branch}`,
    sha: commit.sha,
    force: false,
  });

  return { kind: "raised", pullRequest: pullRequest.number, budget: decision.budget };
}
