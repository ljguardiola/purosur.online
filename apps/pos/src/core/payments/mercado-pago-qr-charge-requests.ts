import type {
  FollowMercadoPagoQrChargeOutcome,
  StartMercadoPagoQrChargeOutcome,
} from "@purosur/contracts";
import {
  followMercadoPagoQrCharge,
  type MercadoPagoQrChargeOrders,
  type MercadoPagoQrChargeSale,
  startMercadoPagoQrCharge,
} from "@purosur/domain/payments/use-cases";
import {
  type IdGenerator,
  type PendingQrPaymentRefusal,
  recordPendingQrPayment,
  type SettleApprovedQrPaymentOutcome,
  settleApprovedQrPayment,
} from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteSaleLedger } from "../sales/sqlite-sale-ledger";
import type { ActionGate } from "../sessions/action-gate";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { SqliteMercadoPagoQrCharges } from "./sqlite-mercado-pago-qr-charges";

export interface MercadoPagoQrChargeRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  orders: MercadoPagoQrChargeOrders;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: () => Date;
  ids: IdGenerator;
}

function qrChargeSale(
  { database, now, ids }: MercadoPagoQrChargeRequestDeps,
  outboxChainKey: string | undefined,
): MercadoPagoQrChargeSale<PendingQrPaymentRefusal, SettleApprovedQrPaymentOutcome> {
  const ledger = new SqliteSaleLedger(database, new SqliteSignInStore(database), outboxChainKey);
  return {
    recordPendingPayment: (payment) => {
      const outcome = recordPendingQrPayment({ ledger, ids }, payment);
      return outcome.kind === "recorded" ? outcome : { kind: "refused", refusal: outcome };
    },
    settleApprovedPayment: (payment) =>
      settleApprovedQrPayment({ ledger, clock: { now }, ids }, payment),
  };
}

function notPerformed(kind: string): { kind: "not_signed_in" | "not_permitted" } {
  return { kind: kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
}

export async function startMercadoPagoQrChargeFor(
  deps: MercadoPagoQrChargeRequestDeps,
  { saleId, amount }: { saleId: string; amount: number },
): Promise<StartMercadoPagoQrChargeOutcome> {
  const guarded = await deps.gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    startMercadoPagoQrCharge(
      { sale: qrChargeSale(deps, undefined), orders: deps.orders, clock: { now: deps.now } },
      { actorId: signedInUserId, saleId, amount },
    ),
  );
  if (guarded.kind !== "performed") {
    return notPerformed(guarded.kind);
  }
  const outcome = guarded.result;
  switch (outcome.kind) {
    case "order_shown":
      return {
        kind: "order_shown",
        payment_transaction_id: outcome.paymentTransactionId,
        amount: outcome.amount,
        wait_seconds: outcome.waitSeconds,
        remaining_seconds: outcome.remainingSeconds,
      };
    case "exceeds_pending":
      return { kind: outcome.kind, pending: outcome.pending };
    case "reaches_buyer_identification_threshold":
      return { kind: outcome.kind, threshold: outcome.threshold };
    default:
      return { kind: outcome.kind };
  }
}

export async function followMercadoPagoQrChargeFor(
  deps: MercadoPagoQrChargeRequestDeps,
  { paymentTransactionId }: { paymentTransactionId: string },
): Promise<FollowMercadoPagoQrChargeOutcome> {
  const outboxChainKey = await deps.readOutboxChainKey();
  if (outboxChainKey === undefined) {
    return { kind: "unavailable" };
  }
  const guarded = await deps.gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    followMercadoPagoQrCharge(
      {
        sale: qrChargeSale(deps, outboxChainKey),
        orders: deps.orders,
        charges: new SqliteMercadoPagoQrCharges(deps.database),
        clock: { now: deps.now },
      },
      { actorId: signedInUserId, paymentTransactionId },
    ),
  );
  if (guarded.kind !== "performed") {
    return notPerformed(guarded.kind);
  }
  const outcome = guarded.result;
  switch (outcome.kind) {
    case "waiting":
      return { kind: "waiting", remaining_seconds: outcome.remainingSeconds };
    case "approved":
      return settledOutcome(outcome.settlement);
    default:
      return { kind: outcome.kind };
  }
}

function settledOutcome(
  settlement: SettleApprovedQrPaymentOutcome,
): FollowMercadoPagoQrChargeOutcome {
  switch (settlement.kind) {
    case "completed":
      return { kind: "completed", sale_id: settlement.saleId, total: settlement.total };
    case "partially_paid":
      return {
        kind: "partially_paid",
        sale_id: settlement.saleId,
        total: settlement.total,
        paid: settlement.paid,
        pending: settlement.pending,
      };
    case "reaches_buyer_identification_threshold":
      return { kind: settlement.kind, threshold: settlement.threshold };
    default:
      return { kind: settlement.kind };
  }
}
