import type { ConvertPaidOrderIntoRefundOutcome } from "@purosur/contracts";
import {
  convertPaidOrderIntoRefund,
  type LatePaymentRefundRequests,
} from "@purosur/domain/payments/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import { SqliteLocalPaidOrders } from "./sqlite-local-paid-orders";

export interface PaidOrderRefundRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  refunds: LatePaymentRefundRequests;
  now: () => Date;
}

export async function convertPaidOrderIntoRefundFor(
  { database, gate, refunds, now }: PaidOrderRefundRequestDeps,
  { paymentTransactionId }: { paymentTransactionId: string },
): Promise<ConvertPaidOrderIntoRefundOutcome> {
  const guarded = await gate.run({ kind: "sell" }, async () =>
    convertPaidOrderIntoRefund(
      { refunds, local: new SqliteLocalPaidOrders({ database }), clock: { now } },
      { paymentTransactionId },
    ),
  );
  if (guarded.kind === "performed") {
    return guarded.result;
  }
  return { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
}
