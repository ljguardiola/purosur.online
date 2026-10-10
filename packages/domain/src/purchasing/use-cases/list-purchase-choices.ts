import { argentinaCalendarDay, type Clock } from "../../shared/index.js";
import { mayBuyByPackaging } from "../model/packaging.js";
import { mayBePurchasedFrom } from "../model/purchase.js";
import { type ListedPackaging, listedPackaging } from "./list-packagings.js";
import type { PurchasingListReader } from "./purchasing-list-reader.js";
import type { Supplier } from "./purchasing-store.js";

export interface PurchaseChoices {
  suppliers: Supplier[];
  packagings: ListedPackaging[];
  today: string;
}

export async function listPurchaseChoices(
  reader: PurchasingListReader,
  clock: Clock,
): Promise<PurchaseChoices> {
  const [suppliers, packagings] = await Promise.all([reader.suppliers(), reader.packagings()]);
  return {
    suppliers: suppliers.filter(mayBePurchasedFrom),
    packagings: packagings
      .filter((packaging) => mayBuyByPackaging(packaging, packaging.productSaleUnit))
      .map(listedPackaging),
    today: argentinaCalendarDay(clock.now()),
  };
}
