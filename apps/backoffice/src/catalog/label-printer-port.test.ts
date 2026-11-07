import { afterEach, describe, expect, test, vi } from "vitest";
import { chooseLabelPrinter, webSerialAvailable } from "./label-printer-port";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("webSerialAvailable", () => {
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
});

function stubRequestPort(requestPort: () => Promise<unknown>) {
  const spy = vi.fn(requestPort);
  vi.stubGlobal("navigator", { serial: { requestPort: spy } });
  return spy;
}

describe("chooseLabelPrinter", () => {
  test("says the browser cannot reach a printer when it has no Web Serial", async () => {
    vi.stubGlobal("navigator", {});

    await expect(chooseLabelPrinter()).resolves.toEqual({ kind: "unavailable" });
  });

  test("hands back the port the person chose", async () => {
    const port = { open: async () => {} };
    stubRequestPort(async () => port);

    await expect(chooseLabelPrinter()).resolves.toEqual({ kind: "chosen", port });
  });

  test("asks only for the label printer's USB vendor, before anything else is awaited", () => {
    const requestPort = stubRequestPort(() => new Promise(() => {}));

    void chooseLabelPrinter();

    expect(requestPort).toHaveBeenCalledWith({ filters: [{ usbVendorId: 0x3513 }] });
  });

  test("says there is no printer when the person closes the chooser or none is connected", async () => {
    stubRequestPort(() => Promise.reject(new DOMException("No port selected", "NotFoundError")));

    await expect(chooseLabelPrinter()).resolves.toEqual({ kind: "no-printer" });
  });

  test("says the chooser failed when the browser refuses to show it", async () => {
    stubRequestPort(() =>
      Promise.reject(new DOMException("Must be handling a user gesture", "SecurityError")),
    );

    await expect(chooseLabelPrinter()).resolves.toEqual({ kind: "chooser-failed" });
  });

  test("says the chooser failed on an error that is not a browser exception", async () => {
    stubRequestPort(() => Promise.reject(new Error("NotFoundError")));

    await expect(chooseLabelPrinter()).resolves.toEqual({ kind: "chooser-failed" });
  });
});
