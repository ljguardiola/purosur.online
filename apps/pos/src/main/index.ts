import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as Sentry from "@sentry/electron/main";
import { app, BrowserWindow, dialog, MessageChannelMain, session, utilityProcess } from "electron";
import { type ChannelSettings, coreArgumentsFor } from "../shared/channel";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
} from "../shared/sentry-scrubbing";
import { loadChannelSettings } from "./channel-settings";
import { buildContentSecurityPolicy } from "./content-security-policy";
import { establishCoreConnection } from "./core-connection";
import { forwardCoreOutput } from "./core-output";
import { broadcastCoreStatus, type CoreStatus } from "./core-status-broadcast";
import { createCoreSupervisor, type SupervisedProcess } from "./core-supervisor";
import {
  CHILD_PROCESS_EVENT_REASONS,
  withoutReplacedDefaultIntegrations,
} from "./error-reporting-integrations";
import { denyDisallowedNavigation, denyWindowOpen } from "./navigation-guard";
import { reportStartFailure } from "./start-failure";
import { showWhenReadyAndReviveRenderer } from "./window-lifecycle";
import { createWindowOptions } from "./window-options";

// Electron derives the data folder from package.json's name, which both channels share; each
// channel's own folder has to be set before the app is ready.
function keepDataInChannelFolder(settings: ChannelSettings): void {
  app.setPath("userData", join(app.getPath("appData"), settings.dataFolder));
}

function initializeErrorReporting(settings: ChannelSettings): void {
  // Initialized even without a DSN: the renderer and core SDKs always report through main, which
  // then has nowhere to send anything and drops it.
  Sentry.init({
    ...(settings.sentryDsn ? { dsn: settings.sentryDsn } : {}),
    environment: settings.channel,
    enableLogs: true,
    // Protocol mode lets the renderer reach main through a privileged custom scheme. Classic IPC
    // mode would inject Sentry's own preload, which exposes an API on the page's window.
    ipcMode: Sentry.IPCMode.Protocol,
    integrations: (defaults) => [
      ...withoutReplacedDefaultIntegrations(defaults),
      Sentry.childProcessIntegration({ events: CHILD_PROCESS_EVENT_REASONS }),
      Sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] }),
    ],
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    beforeSendLog: scrubSentryLog,
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

const DEFAULT_CORE_RETRY_INTERVAL_MS = 90_000;

// Only honored in an unpackaged run (development and end-to-end tests), the same trust boundary
// channel-settings.ts already draws for POS_CHANNEL_FILE: a packaged build always waits the real
// interval, and nothing lets a compromised production install shorten it.
function coreRetryIntervalMs(): number {
  const override = !app.isPackaged ? Number(process.env.POS_CORE_RETRY_INTERVAL_MS) : Number.NaN;
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_CORE_RETRY_INTERVAL_MS;
}

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
    denyDisallowedNavigation(RENDERER_ENTRY_URL, event, url);
  });
  window.webContents.on("will-redirect", (event, url) => {
    denyDisallowedNavigation(RENDERER_ENTRY_URL, event, url);
  });
  window.webContents.setWindowOpenHandler(() => denyWindowOpen());
}

function startRegister(settings: ChannelSettings): void {
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
            window.webContents.on(
              "did-fail-load",
              (_event, code, description, _url, isMainFrame) => {
                if (isMainFrame) {
                  listener({ code, description });
                }
              },
            ),
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
    // Mirrors what the renderer was last told, so a page that loads or reloads later still learns
    // it.
    let coreStatus: CoreStatus = "starting";

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

    function sendCoreStatusToRenderer(): void {
      if (window.isDestroyed()) {
        return;
      }
      broadcastCoreStatus(
        { postMessage: (channel, message) => window.webContents.postMessage(channel, message) },
        coreStatus,
      );
    }

    function setCoreStatus(status: CoreStatus): void {
      coreStatus = status;
      sendCoreStatusToRenderer();
    }

    const supervisor = createCoreSupervisor({
      fork: (): SupervisedProcess => {
        const child = utilityProcess.fork(CORE_ENTRY, coreArgumentsFor(settings.channel), {
          stdio: ["ignore", "pipe", "pipe"],
        });
        forwardCoreOutput(child, process.stdout, process.stderr);
        currentCoreProcess = child;
        return child;
      },
      scheduleRestart: (run, delayMs) => {
        const id = setTimeout(run, delayMs);
        return () => clearTimeout(id);
      },
      now: () => performance.now(),
      policy: RESTART_POLICY,
      retryIntervalMs: coreRetryIntervalMs(),
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
      onStatusChange: setCoreStatus,
    });
    supervisor.start();
    // Quitting kills the core like any other child process; stopping first keeps that exit from
    // being taken for a crash and relaunched while the window is going away.
    app.on("before-quit", () => supervisor.stop());

    // Fires on the renderer's first load and every later reload (e.g. a crash or a manual
    // refresh), so a fresh page always gets a live port to whichever core process is running and
    // learns the core's current status even if it missed the event that last changed it.
    window.webContents.on("did-finish-load", () => {
      rendererHasLoadedOnce = true;
      reconnectRendererToCore();
      sendCoreStatusToRenderer();
    });

    if (devServerUrl) {
      void window.loadURL(devServerUrl);
    } else {
      void window.loadFile(RENDERER_ENTRY);
    }
  });
}

const channelSettings = loadChannelSettings({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  overridePath: process.env.POS_CHANNEL_FILE,
  readFile: (path) => readFileSync(path, "utf8"),
});
if (channelSettings.ok) {
  keepDataInChannelFolder(channelSettings.settings);
  initializeErrorReporting(channelSettings.settings);
  startRegister(channelSettings.settings);
} else {
  // Without its channel the register can't tell whose data folder it may write to, so it doesn't
  // start rather than guess.
  reportStartFailure(channelSettings.reason, {
    isPackaged: app.isPackaged,
    writeError: (line) => console.error(line),
    showErrorBox: (title, content) => dialog.showErrorBox(title, content),
  });
  app.exit(1);
}
