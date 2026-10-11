import * as Sentry from "@sentry/node";

type ErrorReportContext = Record<string, string | number>;

export interface ReportErrorDeps {
  captureException?: (error: unknown, hint?: { extra: ErrorReportContext }) => unknown;
}

export interface ReportErrorOptions extends ReportErrorDeps {
  context?: ErrorReportContext;
}

// Called from pg's error listeners, where a throw is an uncaught exception that crashes the
// process — exactly what these listeners exist to prevent.
function withoutThrowing(report: () => void): void {
  try {
    report();
  } catch {}
}

export function reportError(
  message: string,
  error: unknown,
  { context, ...deps }: ReportErrorOptions = {},
): void {
  const captureException = deps.captureException ?? Sentry.captureException;
  if (context === undefined) {
    withoutThrowing(() => console.error(message, error));
    withoutThrowing(() => captureException(error));
    return;
  }
  withoutThrowing(() => console.error(message, error, context));
  withoutThrowing(() => captureException(error, { extra: context }));
}
