import {
  aMercadoPagoChargeInProgress,
  isValidPointOrderAmount,
  nonCashCharge,
  type PendingMercadoPagoSalePayment,
} from "../../payments/index.js";
import { chargeableSale, isSaleRefusal, type SaleRefusal } from "./chargeable-sale.js";
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
  ids: IdGenerator;
}

export type PendingMercadoPagoPaymentRefusal =
  | SaleRefusal
  | { kind: "invalid_amount" }
  | { kind: "exceeds_pending"; pending: number }
  | { kind: "below_minimum" }
  | { kind: "mercado_pago_charge_in_progress" };

export type RecordPendingMercadoPagoPaymentOutcome =
  | { kind: "recorded"; paymentTransactionId: string }
  | PendingMercadoPagoPaymentRefusal;

export function recordPendingMercadoPagoPayment(
  { ledger, ids }: RecordPendingMercadoPagoPaymentPorts,
  { actorId, saleId, method, amount, occurredAt, waitEndsAt }: RecordPendingMercadoPagoPaymentInput,
): RecordPendingMercadoPagoPaymentOutcome {
  return ledger.transaction<RecordPendingMercadoPagoPaymentOutcome>((tx) => {
    const chargeable = chargeableSale(tx, actorId, saleId, occurredAt);
    if (isSaleRefusal(chargeable)) {
      return chargeable;
    }
    const { sale, pending } = chargeable;
    if (aMercadoPagoChargeInProgress(tx.pendingMercadoPagoPaymentsOf(sale.id), occurredAt)) {
      return { kind: "mercado_pago_charge_in_progress" };
    }
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
