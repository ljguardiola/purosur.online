import type { CashSessionClosesBody } from "@purosur/contracts";
import { formatNumber } from "@purosur/ui";

export const UNIDENTIFIED = "Sin identificar";

export function cashiersWithDifferenceText(
  totals: CashSessionClosesBody["totals"],
): string | undefined {
  return totals.cashiers.length === 0
    ? undefined
    : totals.cashiers
        .map(
          (cashier) => `${cashier.cashier_name ?? UNIDENTIFIED} ${formatNumber(cashier.sessions)}`,
        )
        .join(" · ");
}
