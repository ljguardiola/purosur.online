import type { Clock } from "../../shared/index.js";
import { mayBeShared } from "../model/purchase-order.js";
import type { PurchaseOrderStore } from "./purchase-order-store.js";

export interface SharePurchaseOrderInput {
  locationId: string;
  orderId: string;
  actorId: string;
}

export interface SharePurchaseOrderPorts {
  store: PurchaseOrderStore;
  clock: Clock;
}

export type SharePurchaseOrderOutcome =
  | { kind: "shared" }
  | { kind: "not_found" }
  | { kind: "not_shareable" };

export async function sharePurchaseOrder(
  { store, clock }: SharePurchaseOrderPorts,
  input: SharePurchaseOrderInput,
): Promise<SharePurchaseOrderOutcome> {
  const sentAt = clock.now();
  return store.transaction<SharePurchaseOrderOutcome>(async (tx) => {
    const locked = await tx.lockPurchaseOrder(input.locationId, input.orderId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (!mayBeShared(locked.order.state)) {
      return { kind: "not_shareable" };
    }
    await tx.markPurchaseOrderSent(locked.order.id, { sentAt, actorId: input.actorId });
    return { kind: "shared" };
  });
}
