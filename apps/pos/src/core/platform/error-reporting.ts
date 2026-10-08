import { errorReportingOptions } from "@purosur/contracts";
import type * as Sentry from "@sentry/electron/utility";

export type CoreSentry = Pick<typeof Sentry, "init" | "consoleLoggingIntegration">;

export function initializeErrorReporting(environment: string, sentry: CoreSentry): void {
  sentry.init({
    environment,
    ...errorReportingOptions(),
    integrations: [sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] })],
  });
}
