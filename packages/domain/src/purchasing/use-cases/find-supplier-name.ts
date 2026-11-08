import type { PurchasingListReader } from "./purchasing-list-reader.js";

export type FindSupplierNameOutcome = { kind: "found"; name: string } | { kind: "not_found" };

export async function findSupplierName(
  reader: PurchasingListReader,
  supplierId: string,
): Promise<FindSupplierNameOutcome> {
  const name = await reader.supplierName(supplierId);
  return name === undefined ? { kind: "not_found" } : { kind: "found", name };
}
