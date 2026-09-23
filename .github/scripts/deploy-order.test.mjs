import assert from "node:assert/strict";
import { test } from "node:test";
import { decideDeployAction, isAncestorOf, isCommitSha } from "./deploy-order.mjs";

// isCommitSha -----------------------------------------------------------------

test("accepts a lowercase 40-hex commit SHA", () => {
  assert.equal(isCommitSha("a".repeat(40)), true);
});

test("accepts an uppercase 40-hex commit SHA", () => {
  assert.equal(isCommitSha("A".repeat(40)), true);
});

test("rejects null", () => {
  assert.equal(isCommitSha(null), false);
});

test("rejects a short hex string", () => {
  assert.equal(isCommitSha("abc123"), false);
});

test("rejects a non-hex string of the right length", () => {
  assert.equal(isCommitSha("z".repeat(40)), false);
});

// decideDeployAction ------------------------------------------------------------

test("deploys when staging's version is unreachable (null)", () => {
  const decision = decideDeployAction({ candidateSha: "a".repeat(40), stagingVersion: null });

  assert.equal(decision.deploy, true);
  assert.match(decision.reason, /unreachable|not a commit SHA/);
});

test("deploys when staging's version is not a commit SHA", () => {
  const decision = decideDeployAction({
    candidateSha: "a".repeat(40),
    stagingVersion: "not-a-sha",
  });

  assert.equal(decision.deploy, true);
  assert.match(decision.reason, /not a commit SHA/);
});

test("deploys when staging already serves the exact candidate commit", () => {
  const sha = "a".repeat(40);

  const decision = decideDeployAction({ candidateSha: sha, stagingVersion: sha });

  assert.equal(decision.deploy, true);
  assert.match(decision.reason, /already serves the candidate/);
});

test("skips when the candidate is an ancestor of staging's version", () => {
  const candidateSha = "a".repeat(40);
  const stagingVersion = "b".repeat(40);

  const decision = decideDeployAction({ candidateSha, stagingVersion, isAncestor: true });

  assert.equal(decision.deploy, false);
  assert.match(decision.reason, /skip|already serves/i);
});

test("deploys when the candidate is not an ancestor of staging's version", () => {
  const candidateSha = "a".repeat(40);
  const stagingVersion = "b".repeat(40);

  const decision = decideDeployAction({ candidateSha, stagingVersion, isAncestor: false });

  assert.equal(decision.deploy, true);
});

test("deploys when ancestry is unknown because git does not know the staging commit", () => {
  const candidateSha = "a".repeat(40);
  const stagingVersion = "b".repeat(40);

  const decision = decideDeployAction({ candidateSha, stagingVersion, isAncestor: false });

  assert.equal(decision.deploy, true);
});

// isAncestorOf ------------------------------------------------------------------

test("isAncestorOf reports true when git merge-base --is-ancestor exits 0", async () => {
  const runGit = async (args) => {
    assert.deepEqual(args, ["merge-base", "--is-ancestor", "candidate-sha", "deployed-sha"]);
    return 0;
  };

  assert.equal(await isAncestorOf("candidate-sha", "deployed-sha", runGit), true);
});

test("isAncestorOf reports false when git exits 1 (not an ancestor)", async () => {
  const runGit = async () => 1;

  assert.equal(await isAncestorOf("candidate-sha", "deployed-sha", runGit), false);
});

test("isAncestorOf reports false when git exits with an unrelated error (e.g. unknown revision)", async () => {
  const runGit = async () => 128;

  assert.equal(await isAncestorOf("candidate-sha", "deployed-sha", runGit), false);
});
