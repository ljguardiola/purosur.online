import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LabelToPrint } from "./label-printer-print-sequence";
import { printLabelsOnPrinter } from "./print-labels-on-printer";
import {
  createFakePrinter,
  createFakeSerialPort,
  type FakePrinterOptions,
  type FakeSerialPortOptions,
} from "./test-support/fake-label-printer";

const labels: LabelToPrint[] = [
  {
    raster: { widthDots: 400, heightRows: 240, data: new Uint8Array(50 * 240) },
    copies: 2,
  },
];

function fakePort(
  printerOptions: FakePrinterOptions = {},
  portOptions: FakeSerialPortOptions = {},
) {
  return createFakeSerialPort(createFakePrinter(printerOptions), portOptions);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("printLabelsOnPrinter", () => {
  test("says the printer could not be opened when opening the port fails", async () => {
    const fake = fakePort({}, { openError: new DOMException("busy", "NetworkError") });
    await expect(printLabelsOnPrinter(fake.port, labels)).resolves.toEqual({ kind: "not-opened" });
  });

  test("opens the port at 115200 baud, prints and closes the port", async () => {
    const fake = fakePort();
    await expect(printLabelsOnPrinter(fake.port, labels)).resolves.toEqual({
      kind: "printed",
      printed: 2,
    });
    expect(fake.state.openedWith).toEqual({ baudRate: 115200 });
    expect(fake.state.closed).toBe(true);
  });

  test("reports how many labels were printed when the job is interrupted, and closes the port", async () => {
    const fake = fakePort({ silentOn: 0x01 });
    const outcome = printLabelsOnPrinter(fake.port, labels);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(outcome).resolves.toEqual({ kind: "interrupted", printed: 0, total: 2 });
    expect(fake.state.closed).toBe(true);
  });
});
