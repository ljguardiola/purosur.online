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
  Sentry.init({ dsn: sentryDsn });
}

// electron-vite's output layout: the core is a second main-side entry next to index.js; preload
// and renderer each get their own directory.
const CORE_ENTRY = join(import.meta.dirname, "core.js");
const PRELOAD_ENTRY = join(import.meta.dirname, "../preload/index.cjs");
const RENDERER_ENTRY = join(import.meta.dirname, "../renderer/index.html");

const CORE_RESTART_POLICY = { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 8000 };

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
  showWhenReadyAndReviveRenderer({
    onceReadyToShow: (listener) => window.once("ready-to-show", listener),
    show: () => window.show(),
    isDestroyed: () => window.isDestroyed(),
    webContents: {
      onRendererGone: (listener) =>
        window.webContents.on("render-process-gone", (_event, details) => listener(details.reason)),
      reload: () => window.webContents.reload(),
    },
  });

  // Tracks whichever core process is currently supervised: set inside `fork` itself (which
  // always runs before the supervisor's `onProcessStarted` hook below), so a renderer reload —
  // which needs a fresh port but not a new core process — always reconnects to the live one.
  let currentCoreProcess: Electron.UtilityProcess | undefined;
  let rendererHasLoadedOnce = false;

  function reconnectRendererToCore(): void {
    const coreProcess = currentCoreProcess;
    if (!coreProcess) {
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
    policy: CORE_RESTART_POLICY,
    onProcessStarted: () => {
      // On the very first launch the renderer hasn't loaded (and registered its preload's port
      // listener) yet: the `did-finish-load` handler below connects it once it's ready. A
      // restart while the renderer is already showing needs to reconnect right away instead.
      if (rendererHasLoadedOnce) {
        reconnectRendererToCore();
      }
    },
    onRestartsExhausted: () => {
      // Reported to the error-tracking service once Sentry is initialized in this process.
      console.error("core process: restart attempts exhausted");
    },
  });
  supervisor.start();

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
