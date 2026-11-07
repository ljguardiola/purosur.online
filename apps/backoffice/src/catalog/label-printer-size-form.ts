import {
  LABEL_PRINTER_HEIGHT_MM,
  LABEL_PRINTER_WIDTH_MM,
  type PrinterLabelSize,
} from "@purosur/contracts";
import { formatNumber } from "@purosur/ui";
import { wholeNumberFrom } from "../platform/whole-number";

export type LabelPrinterSizeFormValues = { widthMm: string; heightMm: string };

export function labelPrinterSizeFormValues(size: PrinterLabelSize): LabelPrinterSizeFormValues {
  return { widthMm: String(size.widthMm), heightMm: String(size.heightMm) };
}

export function labelPrinterSizeRequestFrom(values: LabelPrinterSizeFormValues): PrinterLabelSize {
  return {
    widthMm: wholeNumberFrom(values.widthMm),
    heightMm: wholeNumberFrom(values.heightMm),
  };
}

export const LABEL_PRINTER_SIZE_FIELDS = { widthMm: "widthMm", heightMm: "heightMm" } as const;

function rangeText(range: { min: number; max: number }): string {
  return `de ${formatNumber(range.min)} a ${formatNumber(range.max)} mm`;
}

export const LABEL_PRINTER_SIZE_MESSAGES = {
  widthMm: `El ancho va ${rangeText(LABEL_PRINTER_WIDTH_MM)}.`,
  heightMm: `El alto va ${rangeText(LABEL_PRINTER_HEIGHT_MM)}.`,
};
