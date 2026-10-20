import { currentConfirmedListId } from "../model/supplier-price-list.js";
import type {
  SupplierPriceListListing,
  SupplierPriceListReader,
} from "./supplier-price-list-reader.js";

export interface ListedSupplierPriceList extends Omit<SupplierPriceListListing, "confirmedAt"> {
  // Confirmed, but a newer confirmed list of the same supplier took its place.
  replaced: boolean;
}

export function replacedListIds(lists: SupplierPriceListListing[]): Set<string> {
  const reviewed = lists.filter((list) => list.state === "REVIEWED");
  const replaced = new Set<string>();
  for (const supplierId of new Set(reviewed.map((list) => list.supplier.id))) {
    const current = currentConfirmedListId(
      reviewed.flatMap((list) =>
        list.supplier.id === supplierId && list.listDate !== null && list.confirmedAt !== null
          ? [{ id: list.id, listDate: list.listDate, confirmedAt: list.confirmedAt }]
          : [],
      ),
    );
    for (const list of reviewed) {
      if (list.supplier.id === supplierId && list.id !== current) {
        replaced.add(list.id);
      }
    }
  }
  return replaced;
}

export async function listSupplierPriceLists(
  reader: SupplierPriceListReader,
): Promise<ListedSupplierPriceList[]> {
  const lists = await reader.lists();
  const replaced = replacedListIds(lists);
  return lists.map(({ confirmedAt: _confirmedAt, ...list }) => ({
    ...list,
    replaced: replaced.has(list.id),
  }));
}
