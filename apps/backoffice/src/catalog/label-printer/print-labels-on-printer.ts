import { type LabelToPrint, type PrinterLink, runPrintSequence } from "./print-sequence";

export type { LabelToPrint } from "./print-sequence";

export type PrintLabelsOutcome =
  | { kind: "unavailable" }
  | { kind: "no-printer" }
  | { kind: "not-opened" }
  | { kind: "printed"; printed: number }
  | { kind: "interrupted"; printed: number; total: number };

type SerialPortLike = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type SerialLike = {
  requestPort(options: { filters: { usbVendorId: number }[] }): Promise<SerialPortLike>;
};

const LABEL_PRINTER_USB_VENDOR = 0x3513;
const BAUD_RATE = 115_200;

function serialOf(candidate: unknown): SerialLike | null {
  if (typeof candidate !== "object" || candidate === null || !("serial" in candidate)) {
    return null;
  }
  const { serial } = candidate;
  if (typeof serial !== "object" || serial === null || !("requestPort" in serial)) {
    return null;
  }
  return typeof serial.requestPort === "function" ? (serial as SerialLike) : null;
}

async function quietly(action: () => Promise<unknown> | unknown) {
  try {
    await action();
  } catch {
    return;
  }
}

export async function printLabelsOnPrinter(
  labels: readonly LabelToPrint[],
): Promise<PrintLabelsOutcome> {
  const serial = serialOf(navigator);
  if (!serial) {
    return { kind: "unavailable" };
  }

  let port: SerialPortLike;
  try {
    port = await serial.requestPort({ filters: [{ usbVendorId: LABEL_PRINTER_USB_VENDOR }] });
  } catch {
    return { kind: "no-printer" };
  }

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
