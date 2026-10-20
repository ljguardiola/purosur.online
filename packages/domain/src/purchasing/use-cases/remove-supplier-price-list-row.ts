import type { SupplierPriceListStore } from "./supplier-price-list-store.js";

export interface RemoveSupplierPriceListRowInput {
  listId: string;
  rowId: string;
  version: number;
  actorId: string;
}

export type RemoveSupplierPriceListRowOutcome =
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | { kind: "removed" };

export function removeSupplierPriceListRow(
  store: SupplierPriceListStore,
  input: RemoveSupplierPriceListRowInput,
): Promise<RemoveSupplierPriceListRowOutcome> {
  return store.transaction<RemoveSupplierPriceListRowOutcome>(async (tx) => {
    const locked = await tx.lockList(input.listId);
    if (locked.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (locked.list.state !== "EXTRACTED") {
      return { kind: "not_editable" };
    }
    if (locked.list.version !== input.version) {
      return { kind: "stale_version" };
    }
    if ((await tx.lockRow(input.listId, input.rowId)).kind === "not_found") {
      return { kind: "not_found" };
    }

    await tx.removeRow(input.listId, input.rowId, input.actorId);
    return { kind: "removed" };
  });
}
