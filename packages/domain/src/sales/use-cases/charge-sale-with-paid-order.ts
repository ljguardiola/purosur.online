import type { ChargeRefusal } from "../../fiscal/index.js";
import {
  paidOrderAwaitsApplication,
  rebuiltPaidOrderAppliedAmount,
  rebuiltPaidOrderSurplus,
  type SalePayment,
} from "../../payments/index.js";
import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import { chargeableSale, isSaleRefusal, type PartiallyPaid } from "./chargeable-sale.js";
import { completeSale } from "./complete-sale.js";
import type { RegisterRestoration } from "./register-restoration.js";
import type { IdGenerator, SaleLedger } from "./sale-ledger.js";

export interface ChargeSaleWithPaidOrderInput {
  actorId: string;
  saleId: string;
}

export interface ChargeSaleWithPaidOrderPorts {
  ledger: SaleLedger;
  restoration: RegisterRestoration;
  clock: Clock;
  zoneRules: ZoneRulesSource;
  ids: IdGenerator;
}

export type ChargeSaleWithPaidOrderOutcome =
  | { kind: "not_permitted" }
  | { kind: "restoration_in_progress" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "empty_sale" }
  | { kind: "zero_total" }
  | ChargeRefusal
  | { kind: "no_paid_order" }
  | { kind: "already_applied" }
  | PartiallyPaid
  | { kind: "completed"; saleId: string; total: number; applied: number; surplus: number };

export function chargeSaleWithPaidOrder(
  { ledger, restoration, clock, zoneRules, ids }: ChargeSaleWithPaidOrderPorts,
  { actorId, saleId }: ChargeSaleWithPaidOrderInput,
): ChargeSaleWithPaidOrderOutcome {
  return ledger.transaction<ChargeSaleWithPaidOrderOutcome>((tx) => {
    const completedAt = clock.now();
    const chargeable = chargeableSale(
      tx,
      actorId,
      saleId,
      completedAt,
      restoration,
      zoneRules.zoneRules(),
    );
    if (isSaleRefusal(chargeable)) {
      return chargeable;
    }
    const { sale, total, pending } = chargeable;
    const paidOrder = tx.paidOrderOfSale(sale.id);
    if (paidOrder === undefined) {
      return { kind: "no_paid_order" };
    }
    if (!paidOrderAwaitsApplication(paidOrder, tx.salePayments(sale.id))) {
      return { kind: "already_applied" };
    }

    const applied = rebuiltPaidOrderAppliedAmount(paidOrder.amount, pending);
    const approved = {
      id: paidOrder.paymentTransactionId,
      saleId: sale.id,
      kind: "SALE",
      amount: applied,
      state: "APPROVED",
      occurredAt: completedAt,
    } as const;
    const payment: SalePayment =
      paidOrder.method === "POINT"
        ? {
            ...approved,
            method: "POINT",
            provider: "MERCADOPAGO_POINT",
            cardType: paidOrder.cardType,
          }
        : { ...approved, method: "QR", provider: "MERCADOPAGO_QR" };
    tx.recordPayment(payment);
    if (applied < pending) {
      return {
        kind: "partially_paid",
        saleId: sale.id,
        total,
        paid: applied,
        pending: pending - applied,
      };
    }
    completeSale(tx, ids, {
      sale,
      total,
      payments: tx.salePayments(sale.id),
      movements: tx.saleCashMovements(sale.id),
      actorId,
      completedAt,
      rules: zoneRules.zoneRules(),
    });
    return {
      kind: "completed",
      saleId: sale.id,
      total,
      applied,
      surplus: rebuiltPaidOrderSurplus(paidOrder.amount, total),
    };
  });
}
