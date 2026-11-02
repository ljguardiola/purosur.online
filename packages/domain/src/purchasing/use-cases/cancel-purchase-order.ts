import type { Clock } from "../../shared/index.js";
import { mayBeCancelled } from "../model/purchase-order.js";
import type { PurchaseOrderStore } from "./purchase-order-store.js";

export interface CancelPurchaseOrderInput {
  locationId: string;
  orderId: string;
  actorId: string;
}

export interface CancelPurchaseOrderPorts {
  store: PurchaseOrderStore;
  clock: Clock;
}

export type CancelPurchaseOrderOutcome =
  | { kind: "cancelled" }
  | { kind: "not_found" }
  | { kind: "not_cancellable" };

export async function cancelPurchaseOrder(
  { store, clock }: CancelPurchaseOrderPorts,
  input: CancelPurchaseOrderInput,
): Promise<CancelPurchaseOrderOutcome> {
  const cancelledAt = clock.now();
  return store.transaction<CancelPurchaseOrderOutcome>(async (tx) => {
    const locked = await tx.lockPurchaseOrder(input.locationId, input.orderId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!mayBeCancelled(locked.order.state)) {
      return { kind: "not_cancellable" };
    }
    await tx.cancelPurchaseOrder(locked.order.id, { cancelledAt, actorId: input.actorId });
    return { kind: "cancelled" };
  });
}
