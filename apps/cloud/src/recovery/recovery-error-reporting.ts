import * as Sentry from "@sentry/node";

export interface ReportRecoveryBookkeepingErrorDeps {
  /** Injected in tests, the same way `server.ts`'s `reportStartupFailure` does. */
  captureException?: (error: unknown) => unknown;
}

/**
 * Reports a failure from recovery's own bookkeeping (the rejected-attempt accumulator upsert)
 * without throwing, so a request that must still answer with its 429 and `Retry-After` never
 * turns into a 500 just because that write failed (issue #167 T5, H2).
 */
export function reportRecoveryBookkeepingError(
  error: unknown,
  deps: ReportRecoveryBookkeepingErrorDeps = {},
): void {
  const captureException = deps.captureException ?? Sentry.captureException;
  console.error("recovery: bookkeeping failed", error);
  captureException(error);
}
