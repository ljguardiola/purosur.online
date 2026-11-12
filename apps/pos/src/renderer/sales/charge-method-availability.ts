import type { PaymentMethodAvailability } from "@purosur/contracts";
import { formatCents } from "@purosur/ui";
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

type ChargeMethodState = { kind: "offered" } | { kind: "locked"; reason: string };

export type ChargeMethodAvailability = Partial<Record<ChargeMethod, ChargeMethodState>>;

const OFFERED: ChargeMethodState = { kind: "offered" };

const WITHOUT_CONNECTION: ChargeMethodAvailability = {
  CASH: OFFERED,
  TRANSFER: OFFERED,
  STANDALONE_TERMINAL: OFFERED,
};

function belowMinimum(minimum: number): ChargeMethodState {
  return { kind: "locked", reason: `No se ofrece para cobrar menos de ${formatCents(minimum)}` };
}

function pointState(point: PaymentMethodAvailability["point"], minimum: number): ChargeMethodState {
  switch (point) {
    case "available":
      return OFFERED;
    case "offline":
      return { kind: "locked", reason: "No disponible sin conexión" };
    case "not_configured":
      return { kind: "locked", reason: "No configurada en esta caja" };
    case "below_minimum":
      return belowMinimum(minimum);
  }
}

function qrState(qr: PaymentMethodAvailability["qr"], minimum: number): ChargeMethodState {
  switch (qr) {
    case "available":
      return OFFERED;
    case "offline":
      return { kind: "locked", reason: "No disponible sin conexión" };
    case "not_configured":
      return { kind: "locked", reason: "No configurado en esta caja" };
    case "below_minimum":
      return belowMinimum(minimum);
  }
}

export function chargeMethodAvailability(
  availability: CoreData<PaymentMethodAvailability>,
): ChargeMethodAvailability {
  if (availability.status !== "loaded") {
    return WITHOUT_CONNECTION;
  }
  const { qr, point, point_minimum: pointMinimum, qr_minimum: qrMinimum } = availability.value;
  const terminal = pointState(point, pointMinimum);
  return {
    ...WITHOUT_CONNECTION,
    POINT_DEBIT: terminal,
    POINT_CREDIT: terminal,
    QR: qrState(qr, qrMinimum),
  };
}
