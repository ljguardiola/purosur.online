import { afterEach, expect, test, vi } from "vitest";
import { webSerialAvailable } from "./web-serial-available";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("is available when the browser offers Web Serial", () => {
  vi.stubGlobal("navigator", { serial: { requestPort: () => Promise.resolve() } });

  expect(webSerialAvailable()).toBe(true);
});

test("is unavailable when the browser has no serial property", () => {
  vi.stubGlobal("navigator", {});

  expect(webSerialAvailable()).toBe(false);
});

test("is unavailable when serial cannot request a port", () => {
  vi.stubGlobal("navigator", { serial: {} });

  expect(webSerialAvailable()).toBe(false);
});
