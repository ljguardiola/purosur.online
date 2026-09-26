import assert from "node:assert/strict";
import { test } from "node:test";
import { durationsFromRuns, formatDurationsTable, runCli } from "./verify-durations.mjs";

function run(overrides = {}) {
  return {
    head_sha: "a".repeat(40),
    run_started_at: "2026-09-20T10:00:00Z",
    updated_at: "2026-09-20T10:04:32Z",
    conclusion: "success",
    run_attempt: 1,
    status: "completed",
    html_url: "https://github.com/o/r/actions/runs/1",
    ...overrides,
  };
}

// durationsFromRuns -----------------------------------------------------------------

test("turns a completed run into a row with its short sha and duration in seconds", () => {
  const rows = durationsFromRuns({ workflow_runs: [run()] });

  assert.deepEqual(rows, [
    {
      sha: "a".repeat(7),
      startedAt: "2026-09-20T10:00:00Z",
      durationSeconds: 272,
      conclusion: "success",
      attempt: 1,
      url: "https://github.com/o/r/actions/runs/1",
    },
  ]);
});

test("keeps the API's order, newest run first", () => {
  const rows = durationsFromRuns({
    workflow_runs: [run({ head_sha: "b".repeat(40) }), run({ head_sha: "c".repeat(40) })],
  });

  assert.deepEqual(
    rows.map((r) => r.sha),
    ["b".repeat(7), "c".repeat(7)],
  );
});

test("skips a run with no run_started_at", () => {
  const rows = durationsFromRuns({ workflow_runs: [run({ run_started_at: undefined })] });

  assert.deepEqual(rows, []);
});

test("skips a run with no updated_at", () => {
  const rows = durationsFromRuns({ workflow_runs: [run({ updated_at: undefined })] });

  assert.deepEqual(rows, []);
});

test("skips a run that is not completed", () => {
  const rows = durationsFromRuns({ workflow_runs: [run({ status: "in_progress" })] });

  assert.deepEqual(rows, []);
});

test("carries the run attempt and conclusion through unchanged", () => {
  const rows = durationsFromRuns({
    workflow_runs: [run({ conclusion: "failure", run_attempt: 2 })],
  });

  assert.equal(rows[0].conclusion, "failure");
  assert.equal(rows[0].attempt, 2);
});

test("returns an empty array when the response has no run list", () => {
  assert.deepEqual(durationsFromRuns({ message: "Not Found" }), []);
});

// formatDurationsTable ----------------------------------------------------------------

test("formats a row's duration as minutes:seconds", () => {
  const table = formatDurationsTable([
    {
      sha: "abc1234",
      startedAt: "2026-09-20T10:00:00Z",
      durationSeconds: 272,
      conclusion: "success",
      attempt: 1,
      url: "https://github.com/o/r/actions/runs/1",
    },
  ]);

  assert.match(table, /4:32/);
  assert.match(table, /abc1234/);
  assert.match(table, /success/);
  assert.match(table, /https:\/\/github\.com\/o\/r\/actions\/runs\/1/);
});

test("pads a duration under a minute with a leading zero", () => {
  const table = formatDurationsTable([
    {
      sha: "abc1234",
      startedAt: "2026-09-20T10:00:00Z",
      durationSeconds: 9,
      conclusion: "success",
      attempt: 1,
      url: "https://github.com/o/r/actions/runs/1",
    },
  ]);

  assert.match(table, /0:09/);
});

test("shows the run attempt only when it is greater than one", () => {
  const first = formatDurationsTable([
    {
      sha: "abc1234",
      startedAt: "2026-09-20T10:00:00Z",
      durationSeconds: 60,
      conclusion: "success",
      attempt: 1,
      url: "https://github.com/o/r/actions/runs/1",
    },
  ]);
  const retried = formatDurationsTable([
    {
      sha: "abc1234",
      startedAt: "2026-09-20T10:00:00Z",
      durationSeconds: 60,
      conclusion: "success",
      attempt: 3,
      url: "https://github.com/o/r/actions/runs/1",
    },
  ]);

  assert.doesNotMatch(first, /\b3\b/);
  assert.match(retried, /\b3\b/);
});

test("lines each column up under its header", () => {
  const [header, ...lines] = formatDurationsTable([
    {
      sha: "abc1234",
      startedAt: "2026-09-20T10:00:00Z",
      durationSeconds: 272,
      conclusion: "success",
      attempt: 1,
      url: "https://github.com/o/r/actions/runs/1",
    },
    {
      sha: "def5678",
      startedAt: "2026-09-21T09:30:00Z",
      durationSeconds: 3725,
      conclusion: "cancelled",
      attempt: 2,
      url: "https://github.com/o/r/actions/runs/2",
    },
  ]).split("\n");

  for (const [line, sha, conclusion] of [
    [lines[0], "abc1234", "success"],
    [lines[1], "def5678", "cancelled"],
  ]) {
    assert.equal(line.indexOf(sha), header.indexOf("COMMIT"));
    assert.equal(line.indexOf(conclusion), header.indexOf("CONCLUSION"));
    assert.equal(line.indexOf("https://"), header.indexOf("URL"));
  }
  // Durations are right-aligned, ending where the DURATION header ends.
  const durationEnd = header.indexOf("DURATION") + "DURATION".length;
  assert.equal(lines[0].slice(0, durationEnd).endsWith("4:32"), true);
  assert.equal(lines[1].slice(0, durationEnd).endsWith("62:05"), true);
});

test("reports when there are no completed runs to show", () => {
  const table = formatDurationsTable([]);

  assert.match(table, /no completed/i);
});

// runCli ------------------------------------------------------------------------------

test("prints the formatted table built from gh's response", async () => {
  const calls = { gh: [], logs: [] };
  const exitCode = await runCli({
    runGh: async (args) => {
      calls.gh.push(args);
      return JSON.stringify({ workflow_runs: [run()] });
    },
    log: (message) => calls.logs.push(message),
    logError: () => {},
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.gh.length, 1);
  assert.deepEqual(calls.gh[0], [
    "api",
    "repos/{owner}/{repo}/actions/workflows/verify.yml/runs?branch=main&event=push&status=completed&per_page=100",
  ]);
  assert.match(calls.logs.join("\n"), /a{7}/);
});

test("fails with a clear message when gh fails", async () => {
  const errors = [];
  const exitCode = await runCli({
    runGh: async () => {
      throw new Error("gh: not authenticated");
    },
    log: () => {},
    logError: (message) => errors.push(message),
  });

  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /gh: not authenticated/);
});

test("fails with a clear message when gh returns output that is not JSON", async () => {
  const errors = [];
  const exitCode = await runCli({
    runGh: async () => "<html>rate limited</html>",
    log: () => {},
    logError: (message) => errors.push(message),
  });

  assert.equal(exitCode, 1);
  assert.match(errors.join("\n"), /gh api returned output that is not valid JSON/);
});
