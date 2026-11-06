import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { frame, type LabelRaster } from "./packets";
import { type LabelToPrint, runPrintSequence } from "./print-sequence";
import { createFakePrinter, type FakePrinterOptions } from "./test-support/fake-printer";

const blankLabel = (copies: number): LabelToPrint => ({
  raster: {
    widthDots: 400,
    heightRows: 240,
    data: new Uint8Array(50 * 240),
  } satisfies LabelRaster,
  copies,
});

const labels = [blankLabel(2), blankLabel(3)];

async function print(options: FakePrinterOptions = {}, job: LabelToPrint[] = labels) {
  const printer = createFakePrinter(options);
  const outcome = runPrintSequence(printer.link, job);
  return { printer, outcome };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a complete job", () => {
  test("runs the commands in order for two products", async () => {
    const { printer, outcome } = await print();
    await expect(outcome).resolves.toEqual({ kind: "printed", printed: 5 });
    expect(printer.commands()).toEqual([
      0xc1, 0x23, 0x21, 0x01, 0xa3, 0x13, 0x84, 0xe3, 0xa3, 0x13, 0x84, 0xe3, 0xa3, 0xf3, 0xdc,
    ]);
  });

  test("starts with the 0x03 byte right before the connect frame", async () => {
    const { printer, outcome } = await print();
    await outcome;
    expect(printer.writes[0]).toEqual(Uint8Array.of(0x03, ...frame(0xc1, [1])));
  });

  test("sets the label type and the density", async () => {
    const { printer, outcome } = await print();
    await outcome;
    expect(printer.received[1]).toEqual({ cmd: 0x23, data: Uint8Array.of(1) });
    expect(printer.received[2]).toEqual({ cmd: 0x21, data: Uint8Array.of(4) });
  });

  test("starts the print with the total of copies of every label", async () => {
    const { printer, outcome } = await print();
    await outcome;
    expect(printer.received[3]).toEqual({
      cmd: 0x01,
      data: Uint8Array.of(0, 5, 0, 0, 0, 0, 0, 0, 0),
    });
  });

  test("sets each page's size with its rows, columns and copies", async () => {
    const { printer, outcome } = await print();
    await outcome;
    const pageSizes = printer.received.filter((received) => received.cmd === 0x13);
    expect(pageSizes.map((received) => [...received.data])).toEqual([
      [0, 240, 1, 144, 0, 2, 0, 0, 0, 0, 0, 0, 0],
      [0, 240, 1, 144, 0, 3, 0, 0, 0, 0, 0, 0, 0],
    ]);
  });

  test("sends a label's row packets between its page size and its page end", async () => {
    const { printer, outcome } = await print({}, [blankLabel(1)]);
    await outcome;
    expect(printer.received.filter((r) => r.cmd === 0x84)).toEqual([
      { cmd: 0x84, data: Uint8Array.of(0, 0, 240) },
    ]);
  });

  test("polls until the running total of copies is printed", async () => {
    const { printer, outcome } = await print({ pollsBeforeProgress: 3 });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(outcome).resolves.toEqual({ kind: "printed", printed: 5 });
    const polls = printer.received.filter((received) => received.cmd === 0xa3);
    expect(polls.length).toBe(1 + 4 + 4);
  });

  test("waits 300 ms between two polls", async () => {
    const { printer, outcome } = await print({ pollsBeforeProgress: 1 }, [blankLabel(1)]);
    await vi.advanceTimersByTimeAsync(0);
    const before = printer.received.filter((received) => received.cmd === 0xa3).length;
    await vi.advanceTimersByTimeAsync(299);
    expect(printer.received.filter((received) => received.cmd === 0xa3).length).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toEqual({ kind: "printed", printed: 1 });
  });

  test("ignores frames it did not ask for while waiting", async () => {
    const { outcome } = await print({ noiseBeforeAnswers: true });
    await expect(outcome).resolves.toEqual({ kind: "printed", printed: 5 });
  });
});

describe("a job that stops", () => {
  test("is interrupted when an answer does not come in 3 seconds", async () => {
    const { printer, outcome } = await print({ silentOn: 0x21 });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(printer.commands()).toEqual([0xc1, 0x23, 0x21]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toEqual({ kind: "interrupted", printed: 0, total: 5 });
  });

  test("is interrupted with the pages printed when a page makes no progress for 30 seconds", async () => {
    const { printer, outcome } = await print({ stopProgressAt: 2 });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(printer.commands().at(-1)).toBe(0xa3);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(outcome).resolves.toEqual({ kind: "interrupted", printed: 2, total: 5 });
    expect(printer.commands()).not.toContain(0xf3);
  });

  test("is interrupted when the printer disconnects part way", async () => {
    const { outcome } = await print({ disconnectOn: 0x13, disconnectOccurrence: 2 });
    await expect(outcome).resolves.toEqual({ kind: "interrupted", printed: 2, total: 5 });
  });

  test("is interrupted when the printer disconnects before anything is printed", async () => {
    const { outcome } = await print({ disconnectOn: 0xc1 });
    await expect(outcome).resolves.toEqual({ kind: "interrupted", printed: 0, total: 5 });
  });

  test("is interrupted when writing fails", async () => {
    const printer = createFakePrinter();
    const outcome = runPrintSequence(
      { ...printer.link, write: () => Promise.reject(new Error("device removed")) },
      labels,
    );
    await expect(outcome).resolves.toEqual({ kind: "interrupted", printed: 0, total: 5 });
  });

  test("is interrupted when reading fails", async () => {
    const printer = createFakePrinter();
    const outcome = runPrintSequence(
      { ...printer.link, read: () => Promise.reject(new Error("break")) },
      labels,
    );
    await expect(outcome).resolves.toEqual({ kind: "interrupted", printed: 0, total: 5 });
  });
});
