import * as Sentry from "@sentry/node";

export interface ReportRecoveryErrorDeps {
  captureException?: (error: unknown) => unknown;
}

// Called from pg's error listeners, where a throw is an uncaught exception that crashes the
// process — exactly what these listeners exist to prevent.
function withoutThrowing(report: () => void): void {
  try {
    report();
  } catch {
    // ignored
  }
}

export function reportRecoveryError(
  message: string,
  error: unknown,
  deps: ReportRecoveryErrorDeps = {},
): void {
  const captureException = deps.captureException ?? Sentry.captureException;
  withoutThrowing(() => console.error(message, error));
  withoutThrowing(() => captureException(error));
}

/** Never let a bookkeeping write failure turn a request's 429/Retry-After response into a 500. */
export function reportRecoveryBookkeepingError(
  error: unknown,
  deps: ReportRecoveryErrorDeps = {},
): void {
  reportRecoveryError("recovery: bookkeeping failed", error, deps);
}
