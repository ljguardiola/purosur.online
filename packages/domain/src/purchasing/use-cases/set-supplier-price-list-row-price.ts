import type { SupplierPriceListStore } from "./supplier-price-list-store.js";

export interface SetSupplierPriceListRowPriceInput {
  listId: string;
  rowId: string;
  priceCents: number;
  version: number;
  actorId: string;
}

export type SetSupplierPriceListRowPriceOutcome =
  | { kind: "not_found" }
  | { kind: "not_editable" }
  | { kind: "stale_version" }
  | { kind: "updated" };

export function setSupplierPriceListRowPrice(
  store: SupplierPriceListStore,
  input: SetSupplierPriceListRowPriceInput,
): Promise<SetSupplierPriceListRowPriceOutcome> {
  return store.transaction<SetSupplierPriceListRowPriceOutcome>(async (tx) => {
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

    await tx.setRowPrice(input.listId, input.rowId, input.priceCents, input.actorId);
    return { kind: "updated" };
  });
}
