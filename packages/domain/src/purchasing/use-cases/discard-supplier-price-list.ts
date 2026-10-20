import type { SupplierPriceListStore } from "./supplier-price-list-store.js";

export interface DiscardSupplierPriceListInput {
  listId: string;
  version: number;
  actorId: string;
  now: Date;
}

export type DiscardSupplierPriceListOutcome =
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | { kind: "discarded" };

export function discardSupplierPriceList(
  store: SupplierPriceListStore,
  input: DiscardSupplierPriceListInput,
): Promise<DiscardSupplierPriceListOutcome> {
  return store.transaction<DiscardSupplierPriceListOutcome>(async (tx) => {
    const locked = await tx.lockList(input.listId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (locked.list.state !== "EXTRACTED" && locked.list.state !== "READ_FAILED") {
      return { kind: "not_editable" };
    }
    if (locked.list.version !== input.version) {
      return { kind: "stale_version" };
    }

    await tx.discardList(input.listId, input.now, input.actorId);
    return { kind: "discarded" };
  });
}
