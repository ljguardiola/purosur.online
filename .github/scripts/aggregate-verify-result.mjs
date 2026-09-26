// The "verify" job in .github/workflows/verify.yml is the required status check named in
// .github/rulesets/main.json. Splitting the workflow into a scope job, a static job and a tests
// job (a shard matrix) means no single GitHub Actions job both runs a check and reports the merge
// gate's result anymore: this job's only work is reading the other jobs' `needs.*.result` and
// translating them into one pass/fail for that required check.

import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LOG_PREFIX = "aggregate-verify-result";

const NON_FAILING_RESULTS = new Set(["success", "skipped"]);

/**
 * @param {object} input
 * @param {string} input.eventName - `github.event_name` ("push" or "pull_request").
 * @param {string} input.scopeResult - `needs.scope.result`; "skipped" on a push, since the scope
 *   job only runs `if: github.event_name == 'pull_request'`.
 * @param {string} input.scopeDocsOnly - the scope job's `docs_only` output ("true", "false", or
 *   "" when the scope job did not run).
 * @param {string} input.staticResult - `needs.static.result`.
 * @param {string} input.testsResult - `needs.tests.result`; GitHub already reduces the shard
 *   matrix to "failure" if any shard failed and "cancelled" if any shard was cancelled.
 * @returns {{ ok: boolean, reason: string }}
 */
export function decideVerifyResult({
  eventName,
  scopeResult,
  scopeDocsOnly,
  staticResult,
  testsResult,
}) {
  // Only a scope job that positively succeeded and positively said docs-only may excuse a skip.
  // A failed or missing scope decision falls through to requiring static and tests to have
  // actually run and succeeded, which is what their own `if:` conditions do in that case.
  const isDecisivelyDocsOnly =
    eventName === "pull_request" && scopeResult === "success" && scopeDocsOnly === "true";

  const staticOk = isDecisivelyDocsOnly
    ? NON_FAILING_RESULTS.has(staticResult)
    : staticResult === "success";
  if (!staticOk) {
    return { ok: false, reason: `static: ${staticResult}` };
  }

  const testsOk = isDecisivelyDocsOnly
    ? NON_FAILING_RESULTS.has(testsResult)
    : testsResult === "success";
  if (!testsOk) {
    return { ok: false, reason: `tests: ${testsResult}` };
  }

  return {
    ok: true,
    reason: isDecisivelyDocsOnly
      ? "docs-only change: static and tests skipped as designed"
      : "every required job succeeded",
  };
}

/** @returns {number} the process exit code. */
export function runCli({ env = process.env, log = console.log, logError = console.error } = {}) {
  const decision = decideVerifyResult({
    eventName: env.EVENT_NAME,
    scopeResult: env.SCOPE_RESULT,
    scopeDocsOnly: env.SCOPE_DOCS_ONLY,
    staticResult: env.STATIC_RESULT,
    testsResult: env.TESTS_RESULT,
  });

  if (decision.ok) {
    log(`${LOG_PREFIX}: ${decision.reason}`);
    return 0;
  }
  logError(`${LOG_PREFIX}: ${decision.reason}`);
  return 1;
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  process.exit(runCli());
}
