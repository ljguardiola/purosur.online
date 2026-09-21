import { ipcRenderer } from "electron";

// The only thing this preload exposes: it relays the core's MessagePort into the fully isolated
// renderer via `window.postMessage`, exactly as Electron's own MessagePorts guide recommends,
// instead of adding a contextBridge API surface.
ipcRenderer.on("core-port", (event) => {
  window.postMessage("core-port", "*", event.ports);
});
