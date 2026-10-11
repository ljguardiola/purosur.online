import { beforeEach, describe, expect, it } from "vitest";
import { createSerialBarcodeReader } from "./serial-barcode-reader.js";
import { ManualTimers } from "./test-support/manual-timers.js";
import { ScriptedSerialLink } from "./test-support/scripted-serial-link.js";

const RETRY_MS = 5000;
const CARRIAGE_RETURN = 0x0d;

function bytesOf(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

async function nextIoTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("createSerialBarcodeReader", () => {
  let timers: ManualTimers;
  let links: ScriptedSerialLink[];
  let opened: string[];
  let path: string | undefined;
  let openError: Error | undefined;
  let openGate: Promise<void>;
  let codes: string[];
  let failures: unknown[];

  function reader() {
    return createSerialBarcodeReader({
      path: () => path,
      openLink: async (linkPath) => {
        opened.push(linkPath);
        await openGate;
        if (openError) throw openError;
        const link = new ScriptedSerialLink();
        links.push(link);
        return link;
      },
      onCode: (code) => codes.push(code),
      onFailure: (error) => failures.push(error),
      timers,
      retryMs: RETRY_MS,
    });
  }

  beforeEach(() => {
    timers = new ManualTimers();
    links = [];
    opened = [];
    path = "/dev/ttyACM0";
    openError = undefined;
    openGate = Promise.resolve();
    codes = [];
    failures = [];
  });

  it("opens the reader's port and hands over each code it reads", async () => {
    const barcodeReader = reader();

    await barcodeReader.sync();
    const link = links[0] as ScriptedSerialLink;
    link.receive(...bytesOf("7790001234567"), CARRIAGE_RETURN);

    expect(opened).toEqual(["/dev/ttyACM0"]);
    expect(codes).toEqual(["7790001234567"]);
  });

  it("joins a reading split across chunks and hands over a repeated code each time", async () => {
    const barcodeReader = reader();
    await barcodeReader.sync();
    const link = links[0] as ScriptedSerialLink;

    link.receive(...bytesOf("7790"));
    link.receive(...bytesOf("001"), CARRIAGE_RETURN, ...bytesOf("7790001"), CARRIAGE_RETURN);

    expect(codes).toEqual(["7790001", "7790001"]);
  });

  it("keeps the open port when synced again for the same path", async () => {
    const barcodeReader = reader();

    await barcodeReader.sync();
    await barcodeReader.sync();

    expect(opened).toEqual(["/dev/ttyACM0"]);
    expect((links[0] as ScriptedSerialLink).closed).toBe(false);
  });

  it("closes the port when the reader is no longer detected", async () => {
    const barcodeReader = reader();
    await barcodeReader.sync();

    path = undefined;
    await barcodeReader.sync();

    expect((links[0] as ScriptedSerialLink).closed).toBe(true);
    expect(opened).toEqual(["/dev/ttyACM0"]);
  });

  it("moves to the new port when the reader shows up on another path", async () => {
    const barcodeReader = reader();
    await barcodeReader.sync();

    path = "/dev/ttyACM1";
    await barcodeReader.sync();
    (links[0] as ScriptedSerialLink).receive(...bytesOf("old"), CARRIAGE_RETURN);
    (links[1] as ScriptedSerialLink).receive(...bytesOf("new"), CARRIAGE_RETURN);

    expect((links[0] as ScriptedSerialLink).closed).toBe(true);
    expect(opened).toEqual(["/dev/ttyACM0", "/dev/ttyACM1"]);
    expect(codes).toEqual(["new"]);
  });

  it("opens nothing while no reader is detected", async () => {
    path = undefined;

    await reader().sync();

    expect(opened).toEqual([]);
  });

  it("opens one port when synced twice at once", async () => {
    const barcodeReader = reader();

    await Promise.all([barcodeReader.sync(), barcodeReader.sync()]);

    expect(opened).toEqual(["/dev/ttyACM0"]);
  });

  it("does not mix the codes of a reading cut off by a lost port into the next port's", async () => {
    const barcodeReader = reader();
    await barcodeReader.sync();
    (links[0] as ScriptedSerialLink).receive(...bytesOf("cut"));
    (links[0] as ScriptedSerialLink).fail();

    await barcodeReader.sync();
    (links[1] as ScriptedSerialLink).receive(...bytesOf("whole"), CARRIAGE_RETURN);

    expect(codes).toEqual(["whole"]);
  });

  it("opens the port again at the next sync after the port is lost", async () => {
    const barcodeReader = reader();
    await barcodeReader.sync();

    (links[0] as ScriptedSerialLink).fail();
    await barcodeReader.sync();

    expect(opened).toEqual(["/dev/ttyACM0", "/dev/ttyACM0"]);
  });

  it("opens the port again after the retry delay when the port is lost", async () => {
    const barcodeReader = reader();
    await barcodeReader.sync();

    (links[0] as ScriptedSerialLink).fail();
    expect(timers.pending(RETRY_MS)).toBe(1);
    timers.fire(RETRY_MS);
    await nextIoTurn();

    expect(opened).toEqual(["/dev/ttyACM0", "/dev/ttyACM0"]);
  });

  it("reports a port that cannot be opened and retries after the delay", async () => {
    const barcodeReader = reader();
    openError = new Error("access denied");

    await barcodeReader.sync();

    expect(failures).toEqual([openError]);
    expect(timers.pending(RETRY_MS)).toBe(1);

    openError = undefined;
    timers.fire(RETRY_MS);
    await nextIoTurn();
    (links[0] as ScriptedSerialLink).receive(...bytesOf("123"), CARRIAGE_RETURN);

    expect(codes).toEqual(["123"]);
  });

  it("reports a failing streak once however many retries fail", async () => {
    const barcodeReader = reader();
    openError = new Error("access denied");

    await barcodeReader.sync();
    timers.fire(RETRY_MS);
    await nextIoTurn();
    timers.fire(RETRY_MS);
    await nextIoTurn();

    expect(opened).toHaveLength(3);
    expect(failures).toHaveLength(1);
  });

  it("reports again a failure that comes after the port opened", async () => {
    const barcodeReader = reader();
    openError = new Error("access denied");
    await barcodeReader.sync();
    openError = undefined;
    await barcodeReader.sync();

    (links[0] as ScriptedSerialLink).fail();
    openError = new Error("gone");
    await barcodeReader.sync();

    expect(failures).toHaveLength(2);
  });

  it("stops retrying once the reader is no longer detected", async () => {
    const barcodeReader = reader();
    openError = new Error("access denied");
    await barcodeReader.sync();

    path = undefined;
    await barcodeReader.sync();

    expect(timers.pending(RETRY_MS)).toBe(0);
  });

  it("keeps a single retry pending when synced again while failing", async () => {
    const barcodeReader = reader();
    openError = new Error("access denied");

    await barcodeReader.sync();
    await barcodeReader.sync();

    expect(timers.pending(RETRY_MS)).toBe(1);
  });
});
