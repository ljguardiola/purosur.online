import { describe, expect, it } from "vitest";
import { createWindowOptions } from "./window-options";

describe("createWindowOptions", () => {
  it("isolates the page from the application's internals", () => {
    const options = createWindowOptions("/preload/index.cjs");

    expect(options.webPreferences.contextIsolation).toBe(true);
    expect(options.webPreferences.sandbox).toBe(true);
    expect(options.webPreferences.nodeIntegration).toBe(false);
    expect(options.webPreferences.webSecurity).toBe(true);
  });

  it("wires the given preload script", () => {
    const options = createWindowOptions("/preload/index.cjs");

    expect(options.webPreferences.preload).toBe("/preload/index.cjs");
  });
});
