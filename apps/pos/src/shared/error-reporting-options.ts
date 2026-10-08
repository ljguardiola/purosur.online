import {
  ERROR_REPORT_DATA_COLLECTION,
  scrubErrorReport,
  scrubErrorReportBreadcrumb,
  scrubErrorReportLog,
} from "@purosur/contracts";

// Each process imports its own consoleLoggingIntegration from its own @sentry/electron entry.
export function errorReportingOptions<Integration>(
  consoleLoggingIntegration: (options: { levels: ("info" | "warn" | "error")[] }) => Integration,
) {
  return {
    dataCollection: ERROR_REPORT_DATA_COLLECTION,
    integrations: [consoleLoggingIntegration({ levels: ["info", "warn", "error"] })],
    beforeSend: scrubErrorReport,
    beforeBreadcrumb: scrubErrorReportBreadcrumb,
    beforeSendLog: scrubErrorReportLog,
  };
}
