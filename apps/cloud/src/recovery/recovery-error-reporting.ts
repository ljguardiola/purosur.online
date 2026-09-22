import * as Sentry from "@sentry/node";

export interface ReportRecoveryErrorDeps {
  /** Injected in tests, the same way `server.ts`'s `reportStartupFailure` does. */
  captureException?: (error: unknown) => unknown;
}

/** How recovery reports a failure it swallows: the console for a log stream, Sentry for an alert. */
export function reportRecoveryError(
  message: string,
  error: unknown,
  deps: ReportRecoveryErrorDeps = {},
): void {
  const captureException = deps.captureException ?? Sentry.captureException;
  console.error(message, error);
  captureException(error);
}

/**
 * Reports a failure from recovery's own bookkeeping (the rejected-attempt accumulator upsert)
 * without throwing, so a request that must still answer with its 429 and `Retry-After` never
 * turns into a 500 just because that write failed.
 */
export function reportRecoveryBookkeepingError(
  error: unknown,
  deps: ReportRecoveryErrorDeps = {},
): void {
  reportRecoveryError("recovery: bookkeeping failed", error, deps);
}
