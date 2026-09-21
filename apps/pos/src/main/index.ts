import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as Sentry from "@sentry/electron/main";
import { app, BrowserWindow, MessageChannelMain, session, utilityProcess } from "electron";
import { buildContentSecurityPolicy } from "./content-security-policy";
import { establishCoreConnection } from "./core-connection";
import { createCoreSupervisor, type SupervisedProcess } from "./core-supervisor";
import { denyWindowOpen, isAllowedNavigation } from "./navigation-guard";
import { showWhenReadyAndReviveRenderer } from "./window-lifecycle";
import { createWindowOptions } from "./window-options";

// No DSN configured (e.g. a local dev build) means no error tracking, not a crash on startup.
const sentryDsn = import.meta.env.MAIN_VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.POS_CHANNEL,
    enableLogs: true,
    // Protocol mode lets the renderer reach main through a privileged custom scheme. Classic IPC
    // mode would inject Sentry's own preload, which exposes an API on the page's window.
    ipcMode: Sentry.IPCMode.Protocol,
    integrations: (defaults) => [
      ...defaults.filter((integration) => integration.name !== "PreloadInjection"),
      Sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] }),
    ],
  });
}

// electron-vite's output layout: the core is a second main-side entry next to index.js; preload
// and renderer each get their own directory.
const CORE_ENTRY = join(import.meta.dirname, "core.js");
const PRELOAD_ENTRY = join(import.meta.dirname, "../preload/index.cjs");
const RENDERER_ENTRY = join(import.meta.dirname, "../renderer/index.html");

// Bounds both the core's restarts and the interface's reloads.
const RESTART_POLICY = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  stableRunMs: 60_000,
};

const devServerUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;

// A file:// page gets no response headers, so the packaged interface carries its policy in its own
// HTML; this header still covers what a meta element can't, such as frame-ancestors.
function applyContentSecurityPolicy(): void {
  const policy = buildContentSecurityPolicy(devServerUrl ? { devServerUrl } : {});
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

const RENDERER_ENTRY_URL = devServerUrl ?? pathToFileURL(RENDERER_ENTRY).href;

function guardWindow(window: BrowserWindow): void {
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(RENDERER_ENTRY_URL, url)) {
      event.preventDefault();
    }
  });
  window.webContents.setWindowOpenHandler(() => denyWindowOpen());
}

app.whenReady().then(() => {
  applyContentSecurityPolicy();

  const window = new BrowserWindow(createWindowOptions(PRELOAD_ENTRY));
  guardWindow(window);
  showWhenReadyAndReviveRenderer(
    {
      onceReadyToShow: (listener) => window.once("ready-to-show", listener),
      show: () => window.show(),
      isDestroyed: () => window.isDestroyed(),
      webContents: {
        onRendererGone: (listener) =>
          window.webContents.on("render-process-gone", (_event, details) =>
            listener(details.reason),
          ),
        onLoadFailed: (listener) =>
          window.webContents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
            if (isMainFrame) {
              listener({ code, description });
            }
          }),
        reload: () => window.webContents.reload(),
      },
    },
    {
      scheduleReload: (run, delayMs) => {
        setTimeout(run, delayMs);
      },
      now: () => performance.now(),
      policy: RESTART_POLICY,
      onRecoveryExhausted: () => {
        console.error("renderer process: reload attempts exhausted");
        Sentry.captureMessage("renderer process: reload attempts exhausted", "fatal");
      },
      onLoadFailed: ({ code, description }) => {
        console.error(`renderer: page failed to load (${code} ${description})`);
        Sentry.captureMessage(`renderer: page failed to load (${code} ${description})`, "error");
      },
    },
  );

  // Tracks the live core process, if any: set inside `fork` itself (which always runs before the
  // supervisor's `onProcessStarted` hook below) and cleared as soon as it exits, so a renderer
  // reload while the core is down gets no port until the restarted core hands it one.
  let currentCoreProcess: Electron.UtilityProcess | undefined;
  let rendererHasLoadedOnce = false;

  function reconnectRendererToCore(): void {
    const coreProcess = currentCoreProcess;
    if (!coreProcess || window.isDestroyed()) {
      return;
    }

    establishCoreConnection({
      createChannel: () => new MessageChannelMain(),
      sendToCore: (port) => coreProcess.postMessage(null, [port]),
      sendToRenderer: (port) => window.webContents.postMessage("core-port", null, [port]),
    });
  }

  const supervisor = createCoreSupervisor({
    fork: (): SupervisedProcess => {
      const child = utilityProcess.fork(CORE_ENTRY);
      currentCoreProcess = child;
      return child;
    },
    scheduleRestart: (run, delayMs) => {
      setTimeout(run, delayMs);
    },
    now: () => performance.now(),
    policy: RESTART_POLICY,
    onProcessExited: (process) => {
      if (currentCoreProcess === process) {
        currentCoreProcess = undefined;
      }
    },
    onProcessStarted: () => {
      // On the very first launch the renderer hasn't loaded (and registered its preload's port
      // listener) yet: the `did-finish-load` handler below connects it once it's ready. A
      // restart while the renderer is already showing needs to reconnect right away instead.
      if (rendererHasLoadedOnce) {
        reconnectRendererToCore();
      }
    },
    onRestartsExhausted: () => {
      console.error("core process: restart attempts exhausted");
      Sentry.captureMessage("core process: restart attempts exhausted", "fatal");
    },
  });
  supervisor.start();
  // Quitting kills the core like any other child process; stopping first keeps that exit from
  // being taken for a crash and relaunched while the window is going away.
  app.on("before-quit", () => supervisor.stop());

  // Fires on the renderer's first load and every later reload (e.g. a crash or a manual
  // refresh), so a fresh page always gets a live port to whichever core process is running.
  window.webContents.on("did-finish-load", () => {
    rendererHasLoadedOnce = true;
    reconnectRendererToCore();
  });

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(RENDERER_ENTRY);
  }
});
