import { join } from "node:path";
import { app, BrowserWindow, MessageChannelMain, session, utilityProcess } from "electron";
import { buildContentSecurityPolicy } from "./content-security-policy";
import { createCoreSupervisor, type SupervisedProcess } from "./core-supervisor";
import { denyWindowOpen, isSameOriginNavigation } from "./navigation-guard";
import { createWindowOptions } from "./window-options";

// Populated by electron-vite's build (see the build & packaging task): main, preload, core and
// renderer each land in their own output directory next to this file.
const CORE_ENTRY = join(import.meta.dirname, "../core/index.js");
const PRELOAD_ENTRY = join(import.meta.dirname, "../preload/index.js");
const RENDERER_ENTRY = join(import.meta.dirname, "../renderer/index.html");

const CORE_RESTART_POLICY = { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 8000 };

function applyContentSecurityPolicy(): void {
  const policy = buildContentSecurityPolicy();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

function guardWindow(window: BrowserWindow): void {
  window.webContents.on("will-navigate", (event, url) => {
    const appOrigin = new URL(window.webContents.getURL()).origin;
    if (!isSameOriginNavigation(appOrigin, url)) {
      event.preventDefault();
    }
  });
  window.webContents.setWindowOpenHandler(() => denyWindowOpen());
}

function sendRendererPortOnce(window: BrowserWindow, port: Electron.MessagePortMain): void {
  window.webContents.postMessage("core-port", null, [port]);
}

app.whenReady().then(() => {
  applyContentSecurityPolicy();

  const window = new BrowserWindow(createWindowOptions(PRELOAD_ENTRY));
  guardWindow(window);

  // Captured from the supervisor's own fork so the port handoff below always targets the process
  // that is actually supervised, instead of forking a second, untracked core process.
  let firstCoreProcess: Electron.UtilityProcess | undefined;

  const supervisor = createCoreSupervisor({
    fork: (): SupervisedProcess => {
      const child = utilityProcess.fork(CORE_ENTRY);
      firstCoreProcess ??= child;
      return child;
    },
    scheduleRestart: (run, delayMs) => {
      setTimeout(run, delayMs);
    },
    policy: CORE_RESTART_POLICY,
    onRestartsExhausted: () => {
      // Reported to the error-tracking service once Sentry is initialized in this process.
      console.error("core process: restart attempts exhausted");
    },
  });
  supervisor.start();

  // The renderer-to-core channel is only handed over once, on the first launch: a supervised
  // restart of the core process does not currently renegotiate a fresh port with the renderer.
  if (firstCoreProcess) {
    const { port1: corePort, port2: rendererPort } = new MessageChannelMain();
    firstCoreProcess.postMessage(null, [corePort]);
    sendRendererPortOnce(window, rendererPort);
  }

  const devServerUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(RENDERER_ENTRY);
  }
});
