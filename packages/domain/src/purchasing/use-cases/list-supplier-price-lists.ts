import { currentConfirmedListId } from "../model/supplier-price-list.js";
import type {
  SupplierPriceListListing,
  SupplierPriceListReader,
} from "./supplier-price-list-reader.js";

export interface ListedSupplierPriceList extends Omit<SupplierPriceListListing, "confirmedAt"> {
  // Confirmed, but a newer confirmed list of the same supplier took its place.
  replaced: boolean;
}

export async function listSupplierPriceLists(
  reader: SupplierPriceListReader,
): Promise<ListedSupplierPriceList[]> {
  const lists = await reader.lists();

  const currentBySupplier = new Map<string, string | null>();
  for (const supplierId of new Set(lists.map((list) => list.supplier.id))) {
    currentBySupplier.set(
      supplierId,
      currentConfirmedListId(
        lists.flatMap((list) =>
          list.supplier.id === supplierId && list.listDate !== null && list.confirmedAt !== null
            ? [{ id: list.id, listDate: list.listDate, confirmedAt: list.confirmedAt }]
            : [],
        ),
      ),
    );
  }

  return lists.map(({ confirmedAt: _confirmedAt, ...list }) => ({
    ...list,
    replaced: list.state === "REVIEWED" && currentBySupplier.get(list.supplier.id) !== list.id,
  }));
}
