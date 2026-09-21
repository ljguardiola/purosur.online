import * as Sentry from "@sentry/electron/renderer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
} from "../shared/sentry-scrubbing";
// packages/ui's own compiled design tokens (Tailwind's @theme colors, type scale, fonts): the
// vitest browser project loads this globally for every package/app's tests (see the root
// vitest.config.ts), but the packaged app needs its own explicit import to ship any of it. A
// relative path, not a "@purosur/ui/styles/..." specifier, because electron.vite.config.ts's
// "@purosur/ui" alias already maps that whole prefix straight to packages/ui's index.ts.
import "../../../../packages/ui/src/styles/tokens.css";
import { App } from "./App";
import type { PortEventSource } from "./incoming-port";
import { attachIncomingPort } from "./incoming-port";

// Neither a DSN nor an environment: the renderer SDK sends everything to main, which owns the
// destination and stamps its own environment on the renderer's events and logs.
Sentry.init({
  enableLogs: true,
  integrations: [Sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] })],
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubSentryBreadcrumb,
  beforeSendLog: scrubSentryLog,
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
