import type { HandConfirmedPaymentsBody } from "@purosur/contracts";
import { formatOperationNumber } from "@purosur/ui";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { cell, type Workbook } from "../platform/spreadsheet/workbook";
import { periodSummaryRows, summarySheet } from "../shell/report-summary-sheet";
import { CONFIRMED_TIME_ZONE } from "./hand-confirmed-payments-confirmed-time-zone";
import type { HandConfirmedPaymentsFilters } from "./hand-confirmed-payments-filters";
import { METHOD_OPTIONS } from "./hand-confirmed-payments-method-options";

type CashierRow = HandConfirmedPaymentsBody["cashiers"][number];
type PaymentRow = HandConfirmedPaymentsBody["payments"][number];
type MethodTotal = HandConfirmedPaymentsBody["methods"][number];

const UNIDENTIFIED = "Sin identificar";

function totalOf(methods: readonly MethodTotal[], method: MethodTotal["method"]) {
  return methods.find((total) => total.method === method) ?? { method, count: 0, amount: 0 };
}

function optionalText(text: string | null) {
  return text === null ? cell.empty() : cell.text(text);
}

export function handConfirmedPaymentsSpreadsheet(
  shown: HandConfirmedPaymentsBody,
  method: HandConfirmedPaymentsFilters["method"],
  registerLabel: string,
  rows: { cashiers: readonly CashierRow[]; payments: readonly PaymentRow[] },
): Workbook {
  const transfers = totalOf(shown.methods, "TRANSFER");
  const standaloneTerminal = totalOf(shown.methods, "STANDALONE_TERMINAL");
  return {
    sheets: [
      summarySheet([
        ...periodSummaryRows(shown.range),
        ["Caja", cell.text(registerLabel)],
        ["Medio", cell.text(METHOD_OPTIONS.find((option) => option.value === method)?.label ?? "")],
        ["Pagos", cell.count(shown.totals.count)],
        ["Importe de pagos", cell.money(shown.totals.amount)],
        ["Transferencias", cell.count(transfers.count)],
        ["Importe de transferencias", cell.money(transfers.amount)],
        ["Terminal independiente", cell.count(standaloneTerminal.count)],
        ["Importe de terminal independiente", cell.money(standaloneTerminal.amount)],
      ]),
      {
        name: "Por cajero",
        header: [
          "Cajero",
          "Transferencias",
          "Importe de transferencias",
          "Terminal independiente",
          "Importe de terminal independiente",
          "Pagos",
          "Importe",
        ],
        rows: rows.cashiers.map((cashier) => {
          const cashierTransfers = totalOf(cashier.methods, "TRANSFER");
          const cashierTerminal = totalOf(cashier.methods, "STANDALONE_TERMINAL");
          return [
            cell.text(cashier.cashier_name ?? UNIDENTIFIED),
            cell.count(cashierTransfers.count),
            cell.money(cashierTransfers.amount),
            cell.count(cashierTerminal.count),
            cell.money(cashierTerminal.amount),
            cell.count(cashier.count),
            cell.money(cashier.amount),
          ];
        }),
      },
      {
        name: "Detalle de pagos",
        header: ["Confirmado", "Medio", "Venta", "Cajero", "Confirmó", "Importe"],
        rows: rows.payments.map((payment) => [
          cell.instant(payment.confirmed_at, CONFIRMED_TIME_ZONE),
          cell.text(paymentMethodLabel(payment.method)),
          payment.sale_operation_number === null
            ? cell.empty()
            : cell.text(`Operación ${formatOperationNumber(payment.sale_operation_number)}`),
          optionalText(payment.cashier_name),
          optionalText(payment.confirmed_by_name),
          cell.money(payment.amount),
        ]),
      },
    ],
  };
}
