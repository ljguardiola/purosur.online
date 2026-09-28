const LOG_PREFIX = "aggregate-verify-result";

const NON_FAILING_RESULTS = new Set(["success", "skipped"]);

// GitHub reports a job's `needs.<job>.result` as "skipped" when its own `if:` didn't run it, and
// reduces a shard matrix job's result to "failure"/"cancelled" if any shard failed/was cancelled.
export function decideVerifyResult({
  eventName,
  scopeResult,
  scopeDocsOnly,
  scopeCatalogChanged,
  staticResult,
  testsResult,
  visualResult,
}) {
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

  const isDecisivelyCatalogUnchanged = scopeResult === "success" && scopeCatalogChanged === "false";
  const visualOk = isDecisivelyCatalogUnchanged
    ? NON_FAILING_RESULTS.has(visualResult)
    : visualResult === "success";
  if (!visualOk) {
    return { ok: false, reason: `visual: ${visualResult}` };
  }

  return {
    ok: true,
    reason: isDecisivelyDocsOnly
      ? "docs-only change: static and tests skipped as designed"
      : "every required job succeeded",
  };
}

export function runCli({ env = process.env, log = console.log, logError = console.error } = {}) {
  const decision = decideVerifyResult({
    eventName: env.EVENT_NAME,
    scopeResult: env.SCOPE_RESULT,
    scopeDocsOnly: env.SCOPE_DOCS_ONLY,
    scopeCatalogChanged: env.SCOPE_CATALOG_CHANGED,
    staticResult: env.STATIC_RESULT,
    testsResult: env.TESTS_RESULT,
    visualResult: env.VISUAL_RESULT,
  });

  if (decision.ok) {
    log(`${LOG_PREFIX}: ${decision.reason}`);
    return 0;
  }
  logError(`${LOG_PREFIX}: ${decision.reason}`);
  return 1;
}

if (import.meta.main) {
  process.exit(runCli());
}
