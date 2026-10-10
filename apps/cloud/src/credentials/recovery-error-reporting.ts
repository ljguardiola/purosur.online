import { type ReportErrorDeps, reportError } from "../platform/error-reporting.js";

/** Never let a bookkeeping write failure turn a request's 429/Retry-After response into a 500. */
export function reportRecoveryBookkeepingError(error: unknown, deps: ReportErrorDeps = {}): void {
  reportError("recovery: bookkeeping failed", error, deps);
}
