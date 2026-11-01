import type { CashMovementsBody } from "@purosur/contracts";

export const KIND_LABELS: Record<CashMovementsBody["movements"][number]["kind"], string> = {
  CASH_IN: "Ingreso",
  CASH_OUT: "Gasto",
  WITHDRAWAL: "Retiro",
};
