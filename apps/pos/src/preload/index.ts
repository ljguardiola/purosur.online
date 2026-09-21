import { ipcRenderer } from "electron";

// The only things this preload exposes: it relays the core's MessagePort and main's core-status
// broadcast into the fully isolated renderer via `window.postMessage`, exactly as Electron's own
// MessagePorts guide recommends, instead of adding a contextBridge API surface. The renderer
// validates the core-status payload itself (see renderer/core-status.ts) before trusting it.
ipcRenderer.on("core-port", (event) => {
  window.postMessage("core-port", "*", event.ports);
});

ipcRenderer.on("core-status", (_event, message) => {
  window.postMessage({ channel: "core-status", payload: message }, "*");
});
