import type { Clock } from "../../shared/index.js";
import { latePaymentRefund } from "../model/payment-refund.js";
import { isLateApproval } from "../model/payment-transaction.js";
import type {
  MercadoPagoPaymentReplacement,
  MercadoPagoPaymentReplacementStore,
} from "./mercado-pago-payment-replacement-store.js";

export interface ApplyMercadoPagoPaymentReplacementPorts {
  store: MercadoPagoPaymentReplacementStore;
  clock: Clock;
}

export type ApplyMercadoPagoPaymentReplacementOutcome =
  | { kind: "not_recorded" }
  | { kind: "replaced" }
  | { kind: "late_payment_refund_opened" }
  | { kind: "late_payment_refund_already_open" };

export function applyMercadoPagoPaymentReplacement(
  { store, clock }: ApplyMercadoPagoPaymentReplacementPorts,
  replacement: MercadoPagoPaymentReplacement,
): Promise<ApplyMercadoPagoPaymentReplacementOutcome> {
  return store.inOneTransaction<ApplyMercadoPagoPaymentReplacementOutcome>(async (tx) => {
    const payment = await tx.markReplaced(replacement);
    if (payment === null) {
      return { kind: "not_recorded" };
    }
    if (!isLateApproval(payment)) {
      return { kind: "replaced" };
    }
    const opening = await tx.openLatePaymentRefund(latePaymentRefund(payment), clock.now());
    return {
      kind:
        opening === "opened" ? "late_payment_refund_opened" : "late_payment_refund_already_open",
    };
  });
}
