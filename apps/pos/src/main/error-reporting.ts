import { errorReportingOptions } from "@purosur/contracts";
import type * as Sentry from "@sentry/electron/main";
import type { ChannelSettings } from "../shared/channel";
import {
  CHILD_PROCESS_EVENT_REASONS,
  withoutReplacedDefaultIntegrations,
} from "./error-reporting-integrations";

export type MainSentry = Pick<
  typeof Sentry,
  "init" | "childProcessIntegration" | "consoleLoggingIntegration"
> & { readonly IPCMode: Pick<typeof Sentry.IPCMode, "Protocol"> };

export function initializeErrorReporting(settings: ChannelSettings, sentry: MainSentry): void {
  // Initialized even without a DSN: the renderer and core SDKs always report through main, which
  // then has nowhere to send anything and drops it.
  sentry.init({
    ...errorReportingOptions(),
    ...(settings.sentryDsn ? { dsn: settings.sentryDsn } : {}),
    environment: settings.channel,
    // Protocol mode lets the renderer reach main through a privileged custom scheme. Classic IPC
    // mode would inject Sentry's own preload, which exposes an API on the page's window.
    ipcMode: sentry.IPCMode.Protocol,
    integrations: (defaults) => [
      ...withoutReplacedDefaultIntegrations(defaults),
      sentry.childProcessIntegration({ events: CHILD_PROCESS_EVENT_REASONS }),
      sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] }),
    ],
  });
}
