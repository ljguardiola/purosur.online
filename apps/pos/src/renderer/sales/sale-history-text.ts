import type { ReceiptCopyShown, SalesHistoryOutcome } from "@purosur/contracts";
import type { PaymentMethod } from "@purosur/domain";
import type { Tone } from "@purosur/ui";
import { formatInvoiceNumber, formatOperationNumber, formatPointOfSaleNumber } from "@purosur/ui";

type FoundHistory = Extract<SalesHistoryOutcome, { kind: "found" }>;
type HistoryRow = FoundHistory["rows"][number];

export type ShownComprobante = HistoryRow["comprobante"];
export type ShownSaleState = HistoryRow["state"];

const PAYMENT_METHOD_NAMES = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
} as const satisfies Record<PaymentMethod, string>;

const STATE_PRESENTATION = {
  completed: { label: "Completada", tone: "success" },
  in_progress: { label: "En trámite", tone: "info" },
  deferred: { label: "Diferida", tone: "neutral" },
} as const satisfies Record<ShownSaleState, { label: string; tone: Tone }>;

export function comprobantePresentation(
  comprobante: ShownComprobante,
): { name: string; detail: string } | undefined {
  switch (comprobante.kind) {
    case "fiscal":
      return {
        name: "Factura C",
        detail: `PV ${formatPointOfSaleNumber(comprobante.point_of_sale)} · Nº ${formatInvoiceNumber(comprobante.number)}`,
      };
    case "deferred_non_fiscal":
      return { name: "Documento no fiscal", detail: "Venta diferida · falta facturar" };
    case "none":
      return undefined;
  }
}

export function operationText(operationNumber: number): string {
  return `Operación ${formatOperationNumber(operationNumber)}`;
}

export function paymentMethodName(method: PaymentMethod): string {
  return PAYMENT_METHOD_NAMES[method];
}

export function paymentMethodsText(methods: readonly PaymentMethod[]): string {
  return methods.length === 0 ? "—" : methods.map(paymentMethodName).join(" + ");
}

export function saleStatePresentation(state: ShownSaleState): { label: string; tone: Tone } {
  return STATE_PRESENTATION[state];
}

export function receiptCopyPresentation(copy: ReceiptCopyShown): {
  printButton: string;
  comesOutAs: string;
  legend: string | undefined;
} {
  return copy.kind === "original"
    ? { printButton: "Imprimir original", comesOutAs: "Sale como original", legend: undefined }
    : {
        printButton: "Reimprimir duplicado",
        comesOutAs: "Sale como duplicado",
        legend: `DUPLICADO · REIMPRESIÓN Nº ${copy.order_number}`,
      };
}
