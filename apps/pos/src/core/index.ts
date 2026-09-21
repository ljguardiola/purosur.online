import { mainToCoreMessageSchema, rendererToCoreMessageSchema } from "@purosur/contracts";
import * as Sentry from "@sentry/electron/utility";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
} from "../shared/sentry-scrubbing";
import { createMessageGate, type RejectionRecorder, summarizeRejection } from "./message-gate";
import { createRendererConnection } from "./renderer-connection";

// The core is built as a second main-side entry (see electron.vite.config.ts), so it shares
// main's MAIN_VITE_ prefixed environment variables.
const sentryDsn = import.meta.env.MAIN_VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.SENTRY_ENVIRONMENT,
    enableLogs: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] })],
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSendLog: scrubSentryLog,
  });
}

// Console output is also shipped as logs and breadcrumbs, so the local line carries the same
// value-free summary as the reported event.
const recorder: RejectionRecorder = {
  recordRejection(rejection) {
    const summary = summarizeRejection(rejection);
    console.error("core: rejected message", summary);
    Sentry.captureMessage("core: rejected message", { level: "warning", extra: { ...summary } });
  },
};

const gateFromMain = createMessageGate(mainToCoreMessageSchema, recorder);
const gateFromRenderer = createMessageGate(rendererToCoreMessageSchema, recorder);

function handleMainMessage(): void {
  // No business logic yet: the gate existing and wired up is what this shell proves.
}

function handleRendererMessage(): void {
  // No business logic yet: the gate existing and wired up is what this shell proves.
}

const rendererConnection = createRendererConnection((data) => {
  gateFromRenderer(data, handleRendererMessage);
});

process.parentPort.on("message", (event) => {
  const [rendererPort] = event.ports;
  if (rendererPort) {
    rendererConnection.adopt(rendererPort);
    return;
  }

  gateFromMain(event.data, handleMainMessage);
});
