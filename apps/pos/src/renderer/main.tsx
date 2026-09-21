import * as Sentry from "@sentry/electron/renderer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { attachIncomingPort, type PortEventSource } from "./incoming-port";

const sentryDsn = import.meta.env.RENDERER_VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.POS_CHANNEL,
    enableLogs: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] })],
  });
}

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

// Captured for later business features; the shell itself has none yet, so nothing is sent on it.
attachIncomingPort(windowPortSource, window, (_port) => {});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
