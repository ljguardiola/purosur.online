import type { ErrorReportingConfiguration } from "@purosur/contracts";
import { scrubErrorReport } from "@purosur/contracts";
import { breadcrumbsIntegration, captureException, init } from "@sentry/browser";

export function startSentryReporting(
  configuration: Extract<ErrorReportingConfiguration, { enabled: true }>,
  sentry = { init, captureException, breadcrumbsIntegration },
): (error: unknown) => void {
  sentry.init({
    dsn: configuration.dsn,
    environment: configuration.environment,
    release: configuration.release,
    sendDefaultPii: false,
    beforeSend: scrubErrorReport,
    // A click breadcrumb copies the element's aria-label, title, name and alt, which can hold personal data.
    integrations: [sentry.breadcrumbsIntegration({ dom: false })],
  });
  return (error) => {
    sentry.captureException(error);
  };
}
