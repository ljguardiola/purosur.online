import { describe, expect, it } from "vitest";
import { createRegisterWindow } from "./create-register-window";
import type { WindowOptions } from "./window-options";

function fakeElectron() {
  const calls: string[] = [];
  const constructed: WindowOptions[] = [];
  class FakeBrowserWindow {
    constructor(options: WindowOptions) {
      calls.push("new BrowserWindow");
      constructed.push(options);
    }
  }
  const Menu = {
    setApplicationMenu(menu: null) {
      calls.push(`setApplicationMenu(${menu})`);
    },
  };
  return { electron: { Menu, BrowserWindow: FakeBrowserWindow }, calls, constructed };
}

describe("createRegisterWindow", () => {
  it("removes the application menu before the window is constructed", () => {
    const { electron, calls } = fakeElectron();

    createRegisterWindow(electron, "/preload/index.cjs");

    expect(calls).toEqual(["setApplicationMenu(null)", "new BrowserWindow"]);
  });

  it("constructs the window with the register's window options", () => {
    const { electron, constructed } = fakeElectron();

    createRegisterWindow(electron, "/preload/index.cjs");

    expect(constructed).toHaveLength(1);
    expect(constructed[0]?.webPreferences.preload).toBe("/preload/index.cjs");
    expect(constructed[0]?.width).toBe(1280);
  });
});
