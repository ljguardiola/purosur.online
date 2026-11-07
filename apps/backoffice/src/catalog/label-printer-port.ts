export type LabelPrinterPort = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

export type LabelPrinterChoice =
  | { kind: "chosen"; port: LabelPrinterPort }
  | { kind: "unavailable" }
  | { kind: "no-printer" }
  | { kind: "chooser-failed" };

type SerialLike = {
  requestPort(options: { filters: { usbVendorId: number }[] }): Promise<LabelPrinterPort>;
};

const LABEL_PRINTER_USB_VENDOR = 0x3513;

function browserSerial(): SerialLike | null {
  if (typeof navigator !== "object" || navigator === null || !("serial" in navigator)) {
    return null;
  }
  const { serial } = navigator;
  if (typeof serial !== "object" || serial === null || !("requestPort" in serial)) {
    return null;
  }
  return typeof serial.requestPort === "function" ? (serial as SerialLike) : null;
}

export function webSerialAvailable(): boolean {
  return browserSerial() !== null;
}

export async function chooseLabelPrinter(): Promise<LabelPrinterChoice> {
  const serial = browserSerial();
  if (!serial) {
    return { kind: "unavailable" };
  }
  try {
    const port = await serial.requestPort({ filters: [{ usbVendorId: LABEL_PRINTER_USB_VENDOR }] });
    return { kind: "chosen", port };
  } catch (error) {
    return error instanceof DOMException && error.name === "NotFoundError"
      ? { kind: "no-printer" }
      : { kind: "chooser-failed" };
  }
}
