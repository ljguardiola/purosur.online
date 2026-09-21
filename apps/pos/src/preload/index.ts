import { ipcRenderer } from "electron";
import { createCoreStatusRelay } from "./core-status-relay";

// The only things this preload exposes: it relays the core's MessagePort and main's core-status
// broadcast into the fully isolated renderer via `window.postMessage`, exactly as Electron's own
// MessagePorts guide recommends, instead of adding a contextBridge API surface. The renderer
// validates the core-status payload itself (see renderer/core-status.ts) before trusting it.
ipcRenderer.on("core-port", (event) => {
  window.postMessage("core-port", "*", event.ports);
});

// Main's status can arrive before the page's listener exists, so the latest one is kept and
// replayed when the page asks for it.
const coreStatusRelay = createCoreStatusRelay((data) => window.postMessage(data, "*"));

ipcRenderer.on("core-status", (_event, message) => {
  coreStatusRelay.fromMain(message);
});

window.addEventListener("message", (event) => {
  coreStatusRelay.fromPage(event.data);
});
