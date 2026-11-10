import { createWindowOptions, type WindowOptions } from "./window-options";

export interface WindowElectron<Window> {
  Menu: { setApplicationMenu(menu: null): void };
  BrowserWindow: new (options: WindowOptions) => Window;
}

export function createRegisterWindow<Window>(
  electron: WindowElectron<Window>,
  preloadPath: string,
): Window {
  return new electron.BrowserWindow(createWindowOptions(preloadPath));
}
