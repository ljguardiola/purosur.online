import {
  isValidPointOrderAmount,
  nonCashCharge,
  type PendingMercadoPagoSalePayment,
} from "../../payments/index.js";
import { isSaleRefusal, type NewPaymentRefusal, saleOpenToNewPayment } from "./chargeable-sale.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface RecordPendingMercadoPagoPaymentInput {
  actorId: string;
  saleId: string;
  method: PendingMercadoPagoSalePayment["method"];
  amount: number;
  occurredAt: Date;
  waitEndsAt: Date;
}

export interface RecordPendingMercadoPagoPaymentPorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
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
  { ledger, restoration, ids }: RecordPendingMercadoPagoPaymentPorts,
  { actorId, saleId, method, amount, occurredAt, waitEndsAt }: RecordPendingMercadoPagoPaymentInput,
): RecordPendingMercadoPagoPaymentOutcome {
  return ledger.transaction<RecordPendingMercadoPagoPaymentOutcome>((tx) => {
    const chargeable = saleOpenToNewPayment(tx, actorId, saleId, occurredAt, restoration);
    if (isSaleRefusal(chargeable)) {
      return chargeable;
    }
    const { sale, pending } = chargeable;
    const charge = nonCashCharge(pending, amount);
    if (charge.kind === "invalid_amount" || charge.kind === "exceeds_pending") {
      return charge;
    }
    if (method === "POINT" && !isValidPointOrderAmount(charge.applied)) {
      return { kind: "below_minimum" };
    }

    const paymentTransactionId = ids.next();
    tx.recordPendingMercadoPagoPayment({
      id: paymentTransactionId,
      saleId: sale.id,
      kind: "SALE",
      ...(method === "POINT"
        ? ({ method, provider: "MERCADOPAGO_POINT" } as const)
        : ({ method, provider: "MERCADOPAGO_QR" } as const)),
      state: "PENDING",
      amount: charge.applied,
      occurredAt,
      waitEndsAt,
    });
    return { kind: "recorded", paymentTransactionId };
  });
}
