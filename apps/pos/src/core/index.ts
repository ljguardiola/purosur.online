import { mainToCoreMessageSchema, rendererToCoreMessageSchema } from "@purosur/contracts";
import * as Sentry from "@sentry/electron/utility";
import { createMessageGate, type RejectionRecorder } from "./message-gate";
import { createRendererConnection } from "./renderer-connection";

// The core is built as a second main-side entry (see electron.vite.config.ts), so it shares
// main's MAIN_VITE_ prefixed environment variables.
const sentryDsn = import.meta.env.MAIN_VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn });
}

const recorder: RejectionRecorder = {
  recordRejection(rejection) {
    console.error("core: rejected message", rejection);
    Sentry.captureMessage("core: rejected message", {
      extra: { raw: rejection.raw, issues: rejection.issues },
    });
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
