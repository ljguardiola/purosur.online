import type { SaleHistoryDetailOutcome, SalesHistoryOutcome } from "@purosur/contracts";
import type { SummaryRowGroupProps, SummaryRowProps } from "@purosur/ui";
import { formatInvoiceNumber, formatPointOfSaleNumber } from "@purosur/ui";

export type SaleDetail = Extract<SaleHistoryDetailOutcome, { kind: "found" }>["detail"];
type ShownComprobante = Extract<
  SalesHistoryOutcome,
  { kind: "found" }
>["rows"][number]["comprobante"];

export function comprobantePresentation(
  comprobante: ShownComprobante,
): { name: string; detail: string } | undefined {
  switch (comprobante.kind) {
    case "fiscal":
      return {
        name: comprobante.authorization === "offline_code" ? "Factura C · CAEA" : "Factura C",
        detail: `PV ${formatPointOfSaleNumber(comprobante.point_of_sale)} · Nº ${formatInvoiceNumber(comprobante.number)}`,
      };
    case "deferred_non_fiscal":
      return { name: "Documento no fiscal", detail: "Venta diferida · falta facturar" };
    case "none":
      return undefined;
  }
}

export const CREDIT_NOTE_NAME = "Nota de crédito C";

export function creditNoteComprobantePresentation(
  creditNote: Extract<NonNullable<SaleDetail["credit_note"]>, { kind: "authorized" }>,
): { name: string; detail: string } {
  return {
    name: CREDIT_NOTE_NAME,
    detail: `PV ${formatPointOfSaleNumber(creditNote.point_of_sale)} · Nº ${formatInvoiceNumber(creditNote.number)}`,
  };
}

export type NextReceiptCopy =
  | { kind: "original" }
  | { kind: "duplicate"; order_number?: number | undefined };

export function receiptCopyPresentation(copy: NextReceiptCopy): {
  printButton: string;
  comesOutAs: string;
  legend: string | undefined;
} {
  return copy.kind === "original"
    ? { printButton: "Imprimir original", comesOutAs: "Sale como original", legend: undefined }
    : {
        printButton: "Reimprimir duplicado",
        comesOutAs: "Sale como duplicado",
        legend:
          copy.order_number === undefined ? undefined : `COPIA DUPLICADA Nº ${copy.order_number}`,
      };
}

export function nonEmptyRows([first, ...rest]: SummaryRowProps[]):
  | SummaryRowGroupProps["rows"]
  | undefined {
  return first === undefined ? undefined : [first, ...rest];
}
