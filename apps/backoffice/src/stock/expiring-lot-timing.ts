import type { ExpiringLot } from "@purosur/contracts";
import { plural } from "@purosur/ui";

function days(count: number): string {
  return plural(count, { one: "1 día", other: `${count} días` });
}

export function expiryTiming({
  expired,
  daysToExpiry,
}: Pick<ExpiringLot, "expired" | "daysToExpiry">): string {
  if (expired) {
    return daysToExpiry === -1 ? "Venció ayer" : `Venció hace ${days(-daysToExpiry)}`;
  }
  if (daysToExpiry === 0) {
    return "Vence hoy";
  }
  return daysToExpiry === 1 ? "Vence mañana" : `Vence en ${days(daysToExpiry)}`;
}
