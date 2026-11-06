import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { printLabelsOnPrinter } from "./print-labels-on-printer";
import type { LabelToPrint } from "./print-sequence";
import {
  createFakePrinter,
  createFakeSerialPort,
  type FakePrinterOptions,
  type FakeSerialPortOptions,
} from "./test-support/fake-printer";

const labels: LabelToPrint[] = [
  {
    raster: { widthDots: 400, heightRows: 240, data: new Uint8Array(50 * 240) },
    copies: 2,
  },
];

function stubSerial(
  printerOptions: FakePrinterOptions = {},
  portOptions: FakeSerialPortOptions = {},
) {
  const fake = createFakeSerialPort(createFakePrinter(printerOptions), portOptions);
  const requestPort = vi.fn(async () => fake.port);
  vi.stubGlobal("navigator", { serial: { requestPort } });
  return { fake, requestPort };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("printLabelsOnPrinter", () => {
  test("says the browser cannot reach a printer when it has no Web Serial", async () => {
    vi.stubGlobal("navigator", {});
    await expect(printLabelsOnPrinter(labels)).resolves.toEqual({ kind: "unavailable" });
  });

  test("says there is no printer when the person closes the chooser or none is connected", async () => {
    vi.stubGlobal("navigator", {
      serial: {
        requestPort: () => Promise.reject(new DOMException("No port selected", "NotFoundError")),
      },
    });
    await expect(printLabelsOnPrinter(labels)).resolves.toEqual({ kind: "no-printer" });
  });

  test("asks only for the label printer's USB vendor", async () => {
    const { requestPort } = stubSerial();
    await printLabelsOnPrinter(labels);
    expect(requestPort).toHaveBeenCalledWith({ filters: [{ usbVendorId: 0x3513 }] });
  });

  test("says the printer could not be opened when opening the port fails", async () => {
    stubSerial({}, { openError: new DOMException("busy", "NetworkError") });
    await expect(printLabelsOnPrinter(labels)).resolves.toEqual({ kind: "not-opened" });
  });

  test("opens the port at 115200 baud, prints and closes the port", async () => {
    const { fake } = stubSerial();
    await expect(printLabelsOnPrinter(labels)).resolves.toEqual({ kind: "printed", printed: 2 });
    expect(fake.state.openedWith).toEqual({ baudRate: 115200 });
    expect(fake.state.closed).toBe(true);
  });

  test("reports how many labels were printed when the job is interrupted, and closes the port", async () => {
    const { fake } = stubSerial({ silentOn: 0x01 });
    const outcome = printLabelsOnPrinter(labels);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(outcome).resolves.toEqual({ kind: "interrupted", printed: 0, total: 2 });
    expect(fake.state.closed).toBe(true);
  });
});
