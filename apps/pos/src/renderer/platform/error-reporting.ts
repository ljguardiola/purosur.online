import { errorReportingOptions } from "@purosur/contracts";
import type * as Sentry from "@sentry/electron/renderer";

export interface RendererSentry {
  readonly init: (options: NonNullable<Parameters<typeof Sentry.init>[0]>) => void;
  readonly consoleLoggingIntegration: typeof Sentry.consoleLoggingIntegration;
}

export function initializeErrorReporting(sentry: RendererSentry): void {
  sentry.init({
    ...errorReportingOptions(),
    integrations: [sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] })],
  });
}
