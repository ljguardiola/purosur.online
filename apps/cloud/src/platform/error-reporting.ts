import * as Sentry from "@sentry/node";

export interface ReportErrorDeps {
  captureException?: (error: unknown) => unknown;
}

// Called from pg's error listeners, where a throw is an uncaught exception that crashes the
// process — exactly what these listeners exist to prevent.
function withoutThrowing(report: () => void): void {
  try {
    report();
  } catch {}
}

export function reportError(message: string, error: unknown, deps: ReportErrorDeps = {}): void {
  const captureException = deps.captureException ?? Sentry.captureException;
  withoutThrowing(() => console.error(message, error));
  withoutThrowing(() => captureException(error));
}
