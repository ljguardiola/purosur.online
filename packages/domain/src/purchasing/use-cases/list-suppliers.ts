import type { PurchasingListReader } from "./purchasing-list-reader.js";
import type { Supplier } from "./purchasing-store.js";

export function listSuppliers(reader: PurchasingListReader): Promise<Supplier[]> {
  return reader.suppliers();
}
