import { ipcRenderer } from "electron";
import { createCoreStatusRelay } from "./core-status-relay";

// Relays the core's MessagePort and main's core-status broadcast via `window.postMessage`, as
// Electron's own MessagePorts guide recommends, instead of a contextBridge API surface.
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
