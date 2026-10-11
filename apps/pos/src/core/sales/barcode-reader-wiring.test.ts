import type { SalesCoreToRendererMessage } from "@purosur/contracts";
import type { SerialDeviceStanding } from "@purosur/domain";
import { beforeEach, describe, expect, it } from "vitest";
import type { SerialDeviceReading } from "../register/serial-device-watch";
import { createBarcodeReaderWiring } from "./barcode-reader-wiring";
import { ManualTimers } from "./test-support/manual-timers";
import { ScriptedSerialLink } from "./test-support/scripted-serial-link";

const RETRY_MS = 3000;
const CARRIAGE_RETURN = 0x0d;
const NOT_DETECTED: SerialDeviceStanding = { kind: "not_detected" };

function bytesOf(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

async function nextIoTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function listed(scale: SerialDeviceStanding, reader: SerialDeviceStanding): SerialDeviceReading {
  return { kind: "listed", standings: { scale, reader } };
}

describe("the register's barcode reader wiring", () => {
  let reading: SerialDeviceReading;
  let startWatch: Promise<void>;
  let watchStarts: number;
  let opened: string[];
  let links: ScriptedSerialLink[];
  let openError: Error | undefined;
  let told: SalesCoreToRendererMessage[];
  let failures: { context: string; error: unknown }[];

  function wiring({ watched = true }: { watched?: boolean } = {}) {
    return createBarcodeReaderWiring({
      watch: watched
        ? {
            start: () => {
              watchStarts += 1;
              return startWatch;
            },
            reading: () => reading,
          }
        : undefined,
      openLink: async (path) => {
        opened.push(path);
        if (openError) throw openError;
        const link = new ScriptedSerialLink();
        links.push(link);
        return link;
      },
      tell: (message) => told.push(message),
      reportFailure: (context, error) => failures.push({ context, error }),
      retryMs: RETRY_MS,
      timers: new ManualTimers(),
    });
  }

  beforeEach(() => {
    reading = listed(
      { kind: "matching", path: "/dev/ttyUSB0" },
      { kind: "matching", path: "/dev/ttyACM0" },
    );
    startWatch = Promise.resolve();
    watchStarts = 0;
    opened = [];
    links = [];
    openError = undefined;
    told = [];
    failures = [];
  });

  it("starts the device watch, then opens the reader's port and tells each code it reads", async () => {
    await wiring().startWatch();
    (links[0] as ScriptedSerialLink).receive(...bytesOf("7790001234567"), CARRIAGE_RETURN);

    expect(watchStarts).toBe(1);
    expect(opened).toEqual(["/dev/ttyACM0"]);
    expect(told).toEqual([{ type: "barcode-read", code: "7790001234567" }]);
  });

  it("opens the reader's port only once the device watch has started", async () => {
    let finishStarting = (): void => {};
    startWatch = new Promise<void>((resolve) => {
      finishStarting = resolve;
    });

    const starting = wiring().startWatch();
    await nextIoTurn();
    expect(opened).toEqual([]);

    finishStarting();
    await starting;
    expect(opened).toEqual(["/dev/ttyACM0"]);
  });

  it("opens the reader's port when the devices change to show it", async () => {
    reading = listed(NOT_DETECTED, NOT_DETECTED);
    const barcodeReader = wiring();
    await barcodeReader.startWatch();
    expect(opened).toEqual([]);

    reading = listed(NOT_DETECTED, { kind: "matching", path: "/dev/ttyACM1" });
    await barcodeReader.onDevicesChanged();

    expect(opened).toEqual(["/dev/ttyACM1"]);
  });

  it("opens no port without a device watch", async () => {
    const barcodeReader = wiring({ watched: false });

    await barcodeReader.startWatch();
    await barcodeReader.onDevicesChanged();

    expect(opened).toEqual([]);
  });

  it("reports a port it cannot open as a failure reading the barcode reader", async () => {
    openError = new Error("access denied");

    await wiring().startWatch();

    expect(failures).toEqual([{ context: "reading the barcode reader", error: openError }]);
  });
});
