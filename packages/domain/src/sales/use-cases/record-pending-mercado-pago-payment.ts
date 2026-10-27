import {
  isValidPointOrderAmount,
  nonCashCharge,
  type PointCardType,
} from "../../payments/index.js";
import type { ZoneRulesSource } from "../../shared/index.js";
import { isSaleRefusal, type NewPaymentRefusal, saleOpenToNewPayment } from "./chargeable-sale.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export type RecordPendingMercadoPagoPaymentInput = {
  actorId: string;
  saleId: string;
  amount: number;
  occurredAt: Date;
  waitEndsAt: Date;
} & ({ method: "QR"; cardType?: never } | { method: "POINT"; cardType: PointCardType });

export interface RecordPendingMercadoPagoPaymentPorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  zoneRules: ZoneRulesSource;
  ids: IdGenerator;
}

export type PendingMercadoPagoPaymentRefusal =
  | NewPaymentRefusal
  | { kind: "invalid_amount" }
  | { kind: "exceeds_pending"; pending: number }
  | { kind: "below_minimum" };

export type RecordPendingMercadoPagoPaymentOutcome =
  | { kind: "recorded"; paymentTransactionId: string }
  | PendingMercadoPagoPaymentRefusal;

export function recordPendingMercadoPagoPayment(
  { ledger, restoration, zoneRules, ids }: RecordPendingMercadoPagoPaymentPorts,
  input: RecordPendingMercadoPagoPaymentInput,
): RecordPendingMercadoPagoPaymentOutcome {
  const { actorId, saleId, amount, occurredAt, waitEndsAt } = input;
  return ledger.transaction<RecordPendingMercadoPagoPaymentOutcome>((tx) => {
    const chargeable = saleOpenToNewPayment(
      tx,
      actorId,
      saleId,
      occurredAt,
      restoration,
      zoneRules.zoneRules(),
    );
    if (isSaleRefusal(chargeable)) {
      return chargeable;
    }
    const { sale, pending } = chargeable;
    const charge = nonCashCharge(pending, amount);
    if (charge.kind === "invalid_amount" || charge.kind === "exceeds_pending") {
      return charge;
    }
    if (input.method === "POINT" && !isValidPointOrderAmount(charge.applied)) {
      return { kind: "below_minimum" };
    }

    const paymentTransactionId = ids.next();
    tx.recordPendingMercadoPagoPayment({
      id: paymentTransactionId,
      saleId: sale.id,
      kind: "SALE",
      ...(input.method === "POINT"
        ? ({
            method: input.method,
            provider: "MERCADOPAGO_POINT",
            cardType: input.cardType,
          } as const)
        : ({ method: input.method, provider: "MERCADOPAGO_QR" } as const)),
      state: "PENDING",
      amount: charge.applied,
      occurredAt,
      waitEndsAt,
    });
    return { kind: "recorded", paymentTransactionId };
  });
}
