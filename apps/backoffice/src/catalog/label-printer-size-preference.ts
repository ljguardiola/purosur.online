import { type PrinterLabelSize, printerLabelSizeSchema } from "@purosur/contracts";

const STORAGE_KEY = "purosur-backoffice-label-printer-size";

export const FIRST_LABEL_PRINTER_SIZE: PrinterLabelSize = { widthMm: 50, heightMm: 30 };

export function readLabelPrinterSize(): PrinterLabelSize {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = printerLabelSizeSchema.safeParse(saved === null ? null : JSON.parse(saved));
    return parsed.success ? parsed.data : FIRST_LABEL_PRINTER_SIZE;
  } catch {
    return FIRST_LABEL_PRINTER_SIZE;
  }
}

export function writeLabelPrinterSize(size: PrinterLabelSize): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    // Storage can be unavailable (private browsing, disabled cookies); the size is only a
    // convenience, so a failed write is ignored.
  }
}
