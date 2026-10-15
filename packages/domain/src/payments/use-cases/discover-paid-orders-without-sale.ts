import { classifyPaidOrder, paidOrderDiscoveryStart } from "../model/paid-order-discovery.js";
import type { ApprovedOrderOfRegister, PaidOrderDiscoveryPorts } from "./paid-order-ports.js";

export type DiscoverPaidOrdersWithoutSaleOutcome =
  | {
      kind: "checked";
      applied: number;
      duplicateCharges: number;
      withoutSale: number;
      failed: number;
      completedSaleIds: string[];
    }
  | { kind: "deferred" };

type Handled =
  | { kind: "applied"; completedSaleId: string | undefined }
  | { kind: "duplicate_charge" | "without_sale" | "nothing" | "failed" };

export async function discoverPaidOrdersWithoutSale(
  ports: PaidOrderDiscoveryPorts,
): Promise<DiscoverPaidOrdersWithoutSaleOutcome> {
  const answer = await ports.cloud.approvedSince(paidOrderDiscoveryStart(ports.clock.now()));
  if (answer.kind === "unreachable") {
    return { kind: "deferred" };
  }
  const outcome = {
    kind: "checked" as const,
    applied: 0,
    duplicateCharges: 0,
    withoutSale: 0,
    failed: 0,
    completedSaleIds: [] as string[],
  };
  for (const order of answer.orders) {
    const handled = await handle(ports, order);
    if (handled.kind === "applied") {
      outcome.applied += 1;
      if (handled.completedSaleId !== undefined) {
        outcome.completedSaleIds.push(handled.completedSaleId);
      }
    } else if (handled.kind === "duplicate_charge") {
      outcome.duplicateCharges += 1;
    } else if (handled.kind === "without_sale") {
      outcome.withoutSale += 1;
    } else if (handled.kind === "failed") {
      outcome.failed += 1;
    }
  }
  return outcome;
}

function applyToOpenSale(
  { local, sale }: PaidOrderDiscoveryPorts,
  order: ApprovedOrderOfRegister,
): Handled {
  const actorId = local.actorOfSale(order.saleId);
  if (actorId === undefined) {
    return { kind: "failed" };
  }
  return local.inOneTransaction<Handled>(() => {
    local.holdAsPendingPayment(order);
    const settlement = sale.settleApprovedPayment({
      actorId,
      paymentTransactionId: order.paymentTransactionId,
    });
    if (settlement.kind === "refused") {
      local.approvePayment(order.paymentTransactionId);
    }
    return {
      kind: "applied",
      completedSaleId: settlement.kind === "completed" ? settlement.saleId : undefined,
    };
  });
}

async function handle(
  ports: PaidOrderDiscoveryPorts,
  order: ApprovedOrderOfRegister,
): Promise<Handled> {
  const { refunds, local, clock } = ports;
  try {
    if (local.paidOrderWithoutSale(order.paymentTransactionId)) {
      return { kind: "nothing" };
    }
    switch (classifyPaidOrder(local.localStateOf(order))) {
      case "recorded":
      case "charge_under_way":
        return { kind: "nothing" };
      case "apply_to_open_sale":
        return applyToOpenSale(ports, order);
      case "duplicate_charge": {
        const opening = await refunds.openLatePaymentRefund(order.paymentTransactionId);
        return {
          kind:
            opening.kind === "opened" || opening.kind === "already_open"
              ? "duplicate_charge"
              : "failed",
        };
      }
      case "without_sale":
        local.recordPaidOrderWithoutSale(order, clock.now());
        return { kind: "without_sale" };
    }
  } catch {
    return { kind: "failed" };
  }
}
