import type {
  AbandonMercadoPagoChargeOutcome,
  FollowMercadoPagoChargeOutcome,
  StartMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import {
  abandonMercadoPagoCharge,
  type FollowInterruptedMercadoPagoChargesOutcome,
  followInterruptedMercadoPagoCharges,
  followMercadoPagoCharge,
  type MercadoPagoChargeOrders,
  type MercadoPagoChargeSale,
  startMercadoPagoCharge,
} from "@purosur/domain/payments/use-cases";
import {
  type IdGenerator,
  type PendingMercadoPagoPaymentRefusal,
  type PendingQrPaymentReplacementRefusal,
  recordPendingMercadoPagoPayment,
  replacePendingQrPayment,
  type SettleApprovedMercadoPagoPaymentOutcome,
  settleApprovedMercadoPagoPayment,
} from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteSaleLedger } from "../sales/sqlite-sale-ledger";
import type { ActionGate } from "../sessions/action-gate";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { SqliteMercadoPagoCharges } from "./sqlite-mercado-pago-charges";

export interface MercadoPagoChargeRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  orders: MercadoPagoChargeOrders;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: () => Date;
  ids: IdGenerator;
}

type MercadoPagoChargeSettlement =
  | SettleApprovedMercadoPagoPaymentOutcome
  | { kind: "unavailable" };

function mercadoPagoChargeSale(
  { database, now, ids }: MercadoPagoChargeRequestDeps,
  outboxChainKey: string | undefined,
): MercadoPagoChargeSale<
  PendingMercadoPagoPaymentRefusal,
  MercadoPagoChargeSettlement,
  PendingQrPaymentReplacementRefusal
> {
  const ledger = new SqliteSaleLedger(database, new SqliteSignInStore(database), outboxChainKey);
  return {
    recordPendingPayment: (payment) => {
      const outcome = recordPendingMercadoPagoPayment({ ledger, ids }, payment);
      return outcome.kind === "recorded" ? outcome : { kind: "refused", refusal: outcome };
    },
    settleApprovedPayment: (payment) =>
      outboxChainKey === undefined
        ? { kind: "unavailable" }
        : settleApprovedMercadoPagoPayment({ ledger, clock: { now }, ids }, payment),
    replacePendingPayment: (payment) => {
      const outcome = replacePendingQrPayment({ ledger, ids }, payment);
      return outcome.kind === "replaced" ? outcome : { kind: "refused", refusal: outcome };
    },
  };
}

function notPerformed(kind: string): { kind: "not_signed_in" | "not_permitted" } {
  return { kind: kind === "not_signed_in" ? "not_signed_in" : "not_permitted" };
}

export async function startMercadoPagoChargeFor(
  deps: MercadoPagoChargeRequestDeps,
  { saleId, method, amount }: { saleId: string; method: "QR" | "POINT"; amount: number },
): Promise<StartMercadoPagoChargeOutcome> {
  const guarded = await deps.gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    startMercadoPagoCharge(
      {
        sale: mercadoPagoChargeSale(deps, undefined),
        orders: deps.orders,
        charges: new SqliteMercadoPagoCharges(deps.database),
        clock: { now: deps.now },
      },
      { actorId: signedInUserId, saleId, method, amount },
    ),
  );
  if (guarded.kind !== "performed") {
    return notPerformed(guarded.kind);
  }
  const outcome = guarded.result;
  switch (outcome.kind) {
    case "order_shown":
    case "order_unconfirmed":
      return {
        kind: outcome.kind,
        payment_transaction_id: outcome.paymentTransactionId,
        amount: outcome.amount,
        remaining_seconds: outcome.remainingSeconds,
        wait_seconds: outcome.waitSeconds,
      };
    case "exceeds_pending":
      return { kind: outcome.kind, pending: outcome.pending };
    case "reaches_buyer_identification_threshold":
      return { kind: outcome.kind, threshold: outcome.threshold };
    default:
      return { kind: outcome.kind };
  }
}

export async function followMercadoPagoChargeFor(
  deps: MercadoPagoChargeRequestDeps,
  { paymentTransactionId }: { paymentTransactionId: string },
): Promise<FollowMercadoPagoChargeOutcome> {
  const outboxChainKey = await deps.readOutboxChainKey();
  const guarded = await deps.gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    followMercadoPagoCharge(
      {
        sale: mercadoPagoChargeSale(deps, outboxChainKey),
        orders: deps.orders,
        charges: new SqliteMercadoPagoCharges(deps.database),
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

type SettledMercadoPagoCharge = Extract<
  AbandonMercadoPagoChargeOutcome,
  { kind: "already_paid" }
>["settlement"];

function settledOutcome(settlement: MercadoPagoChargeSettlement): SettledMercadoPagoCharge {
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

export async function abandonMercadoPagoChargeFor(
  deps: MercadoPagoChargeRequestDeps,
  { paymentTransactionId }: { paymentTransactionId: string },
): Promise<AbandonMercadoPagoChargeOutcome> {
  const outboxChainKey = await deps.readOutboxChainKey();
  const guarded = await deps.gate.run({ kind: "sell" }, async ({ signedInUserId }) =>
    abandonMercadoPagoCharge(
      {
        sale: mercadoPagoChargeSale(deps, outboxChainKey),
        orders: deps.orders,
        charges: new SqliteMercadoPagoCharges(deps.database),
        clock: { now: deps.now },
      },
      { actorId: signedInUserId, paymentTransactionId },
    ),
  );
  if (guarded.kind !== "performed") {
    return notPerformed(guarded.kind);
  }
  const outcome = guarded.result;
  if (outcome.kind === "already_paid") {
    return { kind: "already_paid", settlement: settledOutcome(outcome.settlement) };
  }
  return { kind: outcome.kind };
}

export async function followInterruptedMercadoPagoChargesFor(
  deps: MercadoPagoChargeRequestDeps,
): Promise<FollowInterruptedMercadoPagoChargesOutcome<MercadoPagoChargeSettlement>> {
  const outboxChainKey = await deps.readOutboxChainKey();
  return followInterruptedMercadoPagoCharges({
    sale: mercadoPagoChargeSale(deps, outboxChainKey),
    orders: deps.orders,
    charges: new SqliteMercadoPagoCharges(deps.database),
    clock: { now: deps.now },
  });
}
