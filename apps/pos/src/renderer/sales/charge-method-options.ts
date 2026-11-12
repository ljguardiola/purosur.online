import type { PaymentMethodAvailability } from "@purosur/contracts";
import type { CoreData } from "../platform/use-core-query";

export type ChargeMethod =
  | "CASH"
  | "POINT_DEBIT"
  | "POINT_CREDIT"
  | "QR"
  | "TRANSFER"
  | "STANDALONE_TERMINAL";

export const KEYED_CHARGE_METHODS = ["CASH", "POINT_DEBIT", "POINT_CREDIT", "QR"] as const;
export type KeyedChargeMethod = (typeof KEYED_CHARGE_METHODS)[number];

export type ChargeMethodAvailability = {
  enabled: ReadonlySet<ChargeMethod>;
  belowMinimum: number | undefined;
};

const WITHOUT_CONNECTION: readonly ChargeMethod[] = ["CASH", "TRANSFER", "STANDALONE_TERMINAL"];

export function chargeMethodAvailability(
  availability: CoreData<PaymentMethodAvailability>,
): ChargeMethodAvailability {
  if (availability.status !== "loaded") {
    return { enabled: new Set(WITHOUT_CONNECTION), belowMinimum: undefined };
  }
  const { qr, point, point_minimum: minimum } = availability.value;
  return {
    enabled: new Set<ChargeMethod>([
      ...WITHOUT_CONNECTION,
      ...(point === "available" ? (["POINT_DEBIT", "POINT_CREDIT"] as const) : []),
      ...(qr === "available" ? (["QR"] as const) : []),
    ]),
    belowMinimum: point === "below_minimum" ? minimum : undefined,
  };
}
