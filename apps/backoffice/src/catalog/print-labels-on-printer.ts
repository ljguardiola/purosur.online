import type { LabelPrinterPort } from "./label-printer-port";
import {
  type LabelToPrint,
  type PrinterLink,
  runPrintSequence,
  type SequenceOutcome,
} from "./label-printer-print-sequence";

export type { LabelToPrint } from "./label-printer-print-sequence";

export type PrintLabelsOutcome = { kind: "not-opened" } | SequenceOutcome;

const BAUD_RATE = 115_200;

async function quietly(action: () => Promise<unknown> | unknown) {
  try {
    await action();
  } catch {
    return;
  }
}

export async function printLabelsOnPrinter(
  port: LabelPrinterPort,
  labels: readonly LabelToPrint[],
): Promise<PrintLabelsOutcome> {
  try {
    await port.open({ baudRate: BAUD_RATE });
  } catch {
    return { kind: "not-opened" };
  }

  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  const link: PrinterLink = {
    write: (bytes) => writer.write(bytes),
    read: async () => {
      const { done, value } = await reader.read();
      return done ? null : value;
    },
  };

  try {
    return await runPrintSequence(link, labels);
  } finally {
    await quietly(() => reader.cancel());
    reader.releaseLock();
    await quietly(() => writer.releaseLock());
    await quietly(() => port.close());
  }
}
