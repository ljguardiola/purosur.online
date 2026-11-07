import {
  LABEL_PRINTER_HEIGHT_MM,
  LABEL_PRINTER_WIDTH_MM,
  type LabelPrintsBody,
  type PrinterLabelSize,
  printerLabelSizeSchema,
} from "@purosur/contracts";
import { formatNumber } from "@purosur/ui";
import { wholeNumberFrom } from "../platform/whole-number";

export type LabelPrinterSizeFormValues = { widthMm: string; heightMm: string };

type SizeField = keyof LabelPrinterSizeFormValues;

export function labelPrinterSizeFormValues(size: PrinterLabelSize): LabelPrinterSizeFormValues {
  return { widthMm: String(size.widthMm), heightMm: String(size.heightMm) };
}

export function labelPrintsRequestFrom(
  values: LabelPrinterSizeFormValues,
  labels: LabelPrintsBody["labels"],
): LabelPrintsBody {
  return {
    labels,
    size: {
      widthMm: wholeNumberFrom(values.widthMm),
      heightMm: wholeNumberFrom(values.heightMm),
    },
  };
}

function sizeFieldAccepts(field: SizeField, values: LabelPrinterSizeFormValues): boolean {
  return printerLabelSizeSchema.shape[field].safeParse(wholeNumberFrom(values[field])).success;
}

function refusedSizeField(values: LabelPrinterSizeFormValues): SizeField {
  return sizeFieldAccepts("widthMm", values) && !sizeFieldAccepts("heightMm", values)
    ? "heightMm"
    : "widthMm";
}

export const LABEL_PRINTS_FIELDS = {
  labels: null,
  size: refusedSizeField,
  "size.widthMm": "widthMm",
  "size.heightMm": "heightMm",
} as const;

function rangeText(range: { min: number; max: number }): string {
  return `de ${formatNumber(range.min)} a ${formatNumber(range.max)} mm`;
}

function sizeFieldMessage(field: SizeField, noun: string, range: { min: number; max: number }) {
  return (values: LabelPrinterSizeFormValues): string => {
    if (sizeFieldAccepts(field, values)) {
      return `Revisá el ${noun}.`;
    }
    if (Number.isNaN(wholeNumberFrom(values[field]))) {
      return `Ingresá el ${noun} en milímetros enteros, ${rangeText(range)}.`;
    }
    return `El ${noun} va ${rangeText(range)}.`;
  };
}

export const LABEL_PRINTER_SIZE_MESSAGES = {
  widthMm: sizeFieldMessage("widthMm", "ancho", LABEL_PRINTER_WIDTH_MM),
  heightMm: sizeFieldMessage("heightMm", "alto", LABEL_PRINTER_HEIGHT_MM),
};

export function printableLabelSize(values: LabelPrinterSizeFormValues): PrinterLabelSize | null {
  const typed = printerLabelSizeSchema.safeParse(labelPrintsRequestFrom(values, []).size);
  return typed.success ? typed.data : null;
}
