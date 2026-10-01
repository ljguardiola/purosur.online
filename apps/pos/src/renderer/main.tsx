import "@purosur/ui/content-security-policy";
import {
  scrubErrorReport,
  scrubErrorReportBreadcrumb,
  scrubErrorReportLog,
} from "@purosur/contracts";
import * as Sentry from "@sentry/electron/renderer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@purosur/ui/tokens.css";
import { createCoreClient } from "./platform/core-client";
import type { PortEventSource } from "./platform/incoming-port";
import { attachIncomingPort } from "./platform/incoming-port";
import { App } from "./shell/app";
import { RenderFailureRecovery } from "./shell/render-failure-recovery";

// Neither a DSN nor an environment: the renderer SDK sends everything to main, which owns the
// destination and stamps its own environment on the renderer's events and logs.
Sentry.init({
  enableLogs: true,
  integrations: [Sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] })],
  beforeSend: scrubErrorReport,
  beforeBreadcrumb: scrubErrorReportBreadcrumb,
  beforeSendLog: scrubErrorReportLog,
});

// Adapts the DOM's `window` to the pure port-handoff module: real MessageEvents carry a `ports`
// list, but `window.addEventListener`'s own type only knows about the generic DOM `Event`.
const windowPortSource: PortEventSource<MessagePort> = {
  addEventListener(type, listener) {
    window.addEventListener(type, listener as unknown as EventListener);
  },
  removeEventListener(type, listener) {
    window.removeEventListener(type, listener as unknown as EventListener);
  },
};

const core = createCoreClient({ newRequestId: () => crypto.randomUUID() });
attachIncomingPort(windowPortSource, window, (port) => core.connect(port));

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <RenderFailureRecovery reportFailure={(error) => Sentry.captureException(error)}>
        <App core={core} />
      </RenderFailureRecovery>
    </StrictMode>,
  );
}
