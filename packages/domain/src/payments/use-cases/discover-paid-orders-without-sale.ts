import { classifyPaidOrder, paidOrderDiscoveryStart } from "../model/paid-order-discovery.js";
import type { ApprovedOrderOfRegister, PaidOrderDiscoveryPorts } from "./paid-order-ports.js";

export type DiscoverPaidOrdersWithoutSaleOutcome =
  | {
      kind: "checked";
      applied: number;
      duplicateCharges: number;
      withoutSale: number;
      failed: number;
    }
  | { kind: "deferred" };

type Handled = "applied" | "duplicate_charge" | "without_sale" | "nothing" | "failed";

export async function discoverPaidOrdersWithoutSale(
  ports: PaidOrderDiscoveryPorts,
): Promise<DiscoverPaidOrdersWithoutSaleOutcome> {
  const answer = await ports.cloud.approvedSince(paidOrderDiscoveryStart(ports.clock.now()));
  if (answer.kind === "unreachable") {
    return { kind: "deferred" };
  }
  const counts = { applied: 0, duplicateCharges: 0, withoutSale: 0, failed: 0 };
  for (const order of answer.orders) {
    const handled = await handle(ports, order);
    if (handled === "applied") {
      counts.applied += 1;
    } else if (handled === "duplicate_charge") {
      counts.duplicateCharges += 1;
    } else if (handled === "without_sale") {
      counts.withoutSale += 1;
    } else if (handled === "failed") {
      counts.failed += 1;
    }
  }
  return { kind: "checked", ...counts };
}

async function handle(
  { refunds, local, clock }: PaidOrderDiscoveryPorts,
  order: ApprovedOrderOfRegister,
): Promise<Handled> {
  try {
    if (local.paidOrderWithoutSale(order.paymentTransactionId)) {
      return "nothing";
    }
    switch (classifyPaidOrder(local.localStateOf(order))) {
      case "recorded":
        return "nothing";
      case "apply_to_open_sale":
        local.applyApprovedPayment(order);
        return "applied";
      case "duplicate_charge": {
        const opening = await refunds.openLatePaymentRefund(order.paymentTransactionId);
        return opening.kind === "opened" || opening.kind === "already_open"
          ? "duplicate_charge"
          : "failed";
      }
      case "without_sale":
        local.recordPaidOrderWithoutSale(order, clock.now());
        return "without_sale";
    }
  } catch {
    return "failed";
  }
}
