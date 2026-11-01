import type { CashMovementsBody } from "@purosur/contracts";

type KindTotal = CashMovementsBody["totals"]["cash_in"];

export const TOTAL_CARDS = [
  {
    label: "Ingresos",
    movementsLabel: "Movimientos de ingresos",
    totalOf: (totals: CashMovementsBody["totals"]) => totals.cash_in,
  },
  {
    label: "Gastos",
    movementsLabel: "Movimientos de gastos",
    totalOf: (totals: CashMovementsBody["totals"]) => totals.cash_out,
  },
  {
    label: "Retiros",
    movementsLabel: "Movimientos de retiros",
    totalOf: (totals: CashMovementsBody["totals"]) => totals.withdrawal,
  },
] satisfies {
  label: string;
  movementsLabel: string;
  totalOf: (totals: CashMovementsBody["totals"]) => KindTotal;
}[];
