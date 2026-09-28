import type { ErrorReportingConfiguration } from "@purosur/contracts";
import { scrubErrorReport } from "@purosur/contracts";
import { captureException, init } from "@sentry/browser";

export function startSentryReporting(
  configuration: Extract<ErrorReportingConfiguration, { enabled: true }>,
  sentry = { init, captureException },
): (error: unknown) => void {
  sentry.init({
    dsn: configuration.dsn,
    environment: configuration.environment,
    release: configuration.release,
    sendDefaultPii: false,
    beforeSend: scrubErrorReport,
  });
  return (error) => {
    sentry.captureException(error);
  };
}
