import type { Clock } from "../../shared/index.js";
import { PAID_ORDER_PAYMENT_STATE } from "../model/paid-order-discovery.js";
import { latePaymentRefund } from "../model/payment-refund.js";
import type {
  LatePaymentRefundOpening,
  PaymentTransactionLanes,
} from "./mercado-pago-order-ports.js";

export interface OpenRegisterLatePaymentRefundInput {
  registerId: string;
  paymentTransactionId: string;
}

export interface OpenRegisterLatePaymentRefundPorts {
  lanes: PaymentTransactionLanes;
  clock: Clock;
}

export type OpenRegisterLatePaymentRefundOutcome =
  | { kind: LatePaymentRefundOpening }
  | { kind: "not_found" }
  | { kind: "not_approved" }
  | { kind: "replaced" };

export async function openRegisterLatePaymentRefund(
  { lanes, clock }: OpenRegisterLatePaymentRefundPorts,
  { registerId, paymentTransactionId }: OpenRegisterLatePaymentRefundInput,
): Promise<OpenRegisterLatePaymentRefundOutcome> {
  return lanes.inPaymentTransactionLane<OpenRegisterLatePaymentRefundOutcome>(
    paymentTransactionId,
    async (lane) => {
      const transaction = await lane.recordedTransaction(registerId, paymentTransactionId);
      if (transaction === null) {
        return { kind: "not_found" };
      }
      if (transaction.state !== PAID_ORDER_PAYMENT_STATE) {
        return { kind: "not_approved" };
      }
      if (transaction.replaced) {
        return { kind: "replaced" };
      }
      return {
        kind: await lane.openLatePaymentRefund(latePaymentRefund(transaction), clock.now()),
      };
    },
  );
}
