import type { SalesHistoryOutcome } from "@purosur/contracts";
import type { PaymentMethod, PointCardType } from "@purosur/domain";
import type { TagProps } from "@purosur/ui";
import { formatInvoiceNumber, formatOperationNumber, formatPointOfSaleNumber } from "@purosur/ui";
import { PAYMENT_METHOD_NAMES } from "../platform/payment-method-names";
import { comprobantePresentation } from "../shell/sale-receipt-text";

type FoundHistory = Extract<SalesHistoryOutcome, { kind: "found" }>;
type HistoryRow = FoundHistory["rows"][number];

export type ShownSaleState = HistoryRow["state"];

const PAYMENT_METHOD_SHORT_NAMES = {
  ...PAYMENT_METHOD_NAMES,
  QR: "QR",
  POINT: "Point",
} as const satisfies Record<PaymentMethod, string>;

const STATE_PRESENTATION = {
  completed: { label: "Completada", tone: "success" },
  in_progress: { label: "En trámite", tone: "info" },
  deferred: { label: "Diferida", tone: "warning" },
  voided: { label: "Anulada", tone: "error" },
} as const satisfies Record<ShownSaleState, { label: string; tone: TagProps["tone"] }>;

export function operationText(operationNumber: number): string {
  return `Operación ${formatOperationNumber(operationNumber)}`;
}

export function paymentMethodsText(methods: readonly PaymentMethod[]): string {
  return methods.length === 0
    ? "—"
    : methods.map((method) => PAYMENT_METHOD_SHORT_NAMES[method]).join(" · ");
}

export function saleStatePresentation(state: ShownSaleState): {
  label: string;
  tone: TagProps["tone"];
} {
  return STATE_PRESENTATION[state];
}

const POINT_CARD_WORDS = { DEBIT: "débito", CREDIT: "crédito" } as const satisfies Record<
  PointCardType,
  string
>;

export function paymentRowName(method: PaymentMethod, cardType: PointCardType | null): string {
  return method === "POINT" && cardType !== null
    ? `Point ${POINT_CARD_WORDS[cardType]}`
    : PAYMENT_METHOD_SHORT_NAMES[method];
}

export function documentNumberText({
  point_of_sale: pointOfSale,
  number,
}: {
  point_of_sale: number;
  number: number;
}): string {
  return `${formatPointOfSaleNumber(pointOfSale)}-${formatInvoiceNumber(number)}`;
}

type Comprobante = Parameters<typeof comprobantePresentation>[0];

export function comprobanteLine(comprobante: Comprobante): string {
  const presentation = comprobantePresentation(comprobante);
  if (presentation === undefined) {
    return "—";
  }
  return comprobante.kind === "fiscal"
    ? `${presentation.name} · ${documentNumberText(comprobante)}`
    : presentation.name;
}

export function comprobanteRow(
  comprobante: Comprobante,
): { label: string; value: string } | undefined {
  const presentation = comprobantePresentation(comprobante);
  if (presentation === undefined) {
    return undefined;
  }
  return {
    label: presentation.name,
    value: comprobante.kind === "fiscal" ? documentNumberText(comprobante) : presentation.detail,
  };
}
