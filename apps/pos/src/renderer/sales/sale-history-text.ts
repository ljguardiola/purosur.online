import type { SalesHistoryOutcome } from "@purosur/contracts";
import type { PaymentMethod } from "@purosur/domain";
import type { TagProps } from "@purosur/ui";
import { formatOperationNumber } from "@purosur/ui";

type FoundHistory = Extract<SalesHistoryOutcome, { kind: "found" }>;
type HistoryRow = FoundHistory["rows"][number];

export type ShownSaleState = HistoryRow["state"];

const PAYMENT_METHOD_NAMES = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  QR: "QR de Mercado Pago",
  POINT: "Point integrada",
  STANDALONE_TERMINAL: "Terminal independiente",
} as const satisfies Record<PaymentMethod, string>;

const PAYMENT_METHOD_SHORT_NAMES = {
  ...PAYMENT_METHOD_NAMES,
  QR: "QR",
  POINT: "Point",
} as const satisfies Record<PaymentMethod, string>;

const STATE_PRESENTATION = {
  completed: { label: "Completada", tone: "success" },
  in_progress: { label: "En trámite", tone: "info" },
  deferred: { label: "Diferida", tone: "neutral" },
} as const satisfies Record<ShownSaleState, { label: string; tone: TagProps["tone"] }>;

export function operationText(operationNumber: number): string {
  return `Operación ${formatOperationNumber(operationNumber)}`;
}

export function paymentMethodName(method: PaymentMethod): string {
  return PAYMENT_METHOD_NAMES[method];
}

export function paymentMethodsText(methods: readonly PaymentMethod[]): string {
  return methods.length === 0
    ? "—"
    : methods.map((method) => PAYMENT_METHOD_SHORT_NAMES[method]).join(" + ");
}

export function saleStatePresentation(state: ShownSaleState): {
  label: string;
  tone: TagProps["tone"];
} {
  return STATE_PRESENTATION[state];
}
