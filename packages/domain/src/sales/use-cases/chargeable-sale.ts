import type { ChargeRefusal } from "../../fiscal/index.js";
import { aMercadoPagoChargeInProgress, saleBalance } from "../../payments/index.js";
import { buyerIdentificationRefusal } from "../model/buyer-identification-check.js";
import type { SaleWithLines } from "../model/sale.js";
import { amountToCharge } from "../model/sale-discount.js";
import type { SaleLedgerTransaction, SellingSession } from "./sale-ledger.js";
import { isRefusal, sellingSession } from "./selling-session.js";

export type SaleRefusal =
  | { kind: "not_permitted" }
  | { kind: "restoration_in_progress" }
  | { kind: "no_open_session" }
  | { kind: "no_open_sale" }
  | { kind: "empty_sale" }
  | { kind: "zero_total" }
  | ChargeRefusal;

export interface ChargeableSale {
  session: SellingSession;
  sale: SaleWithLines;
  total: number;
  paid: number;
  pending: number;
}

export interface PartiallyPaid {
  kind: "partially_paid";
  saleId: string;
  total: number;
  paid: number;
  pending: number;
}

export function chargeableSale(
  tx: SaleLedgerTransaction,
  actorId: string,
  saleId: string,
  completedAt: Date,
): ChargeableSale | SaleRefusal {
  const session = sellingSession(tx, actorId);
  if (isRefusal(session)) {
    return session;
  }
  const sale = tx.openSale(session.id);
  if (!sale || sale.id !== saleId) {
    return { kind: "no_open_sale" };
  }
  if (sale.lines.length === 0) {
    return { kind: "empty_sale" };
  }
  const total = amountToCharge(sale);
  if (total === 0) {
    return { kind: "zero_total" };
  }
  const payments = tx.salePayments(sale.id);
  const refusal = buyerIdentificationRefusal(
    total,
    payments,
    tx.buyerIdentificationThresholds(),
    completedAt,
  );
  if (refusal) {
    return refusal;
  }
  const { paid, pending } = saleBalance(total, payments);
  return { session, sale, total, paid, pending };
}

export type NewPaymentRefusal = SaleRefusal | { kind: "mercado_pago_charge_in_progress" };

export function saleOpenToNewPayment(
  tx: SaleLedgerTransaction,
  actorId: string,
  saleId: string,
  at: Date,
): ChargeableSale | NewPaymentRefusal {
  const chargeable = chargeableSale(tx, actorId, saleId, at);
  if (isSaleRefusal(chargeable)) {
    return chargeable;
  }
  if (aMercadoPagoChargeInProgress(tx.pendingMercadoPagoPaymentsOf(chargeable.sale.id), at)) {
    return { kind: "mercado_pago_charge_in_progress" };
  }
  return chargeable;
}

export function isSaleRefusal<Refusal extends { kind: string }>(
  result: ChargeableSale | Refusal,
): result is Refusal {
  return "kind" in result;
}
