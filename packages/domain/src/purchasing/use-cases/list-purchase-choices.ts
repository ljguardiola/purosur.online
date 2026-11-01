import { argentinaCalendarDay, type Clock, type ZoneRulesSource } from "../../shared/index.js";
import { mayBePurchasedFrom } from "../model/purchase.js";
import type { PurchasingListReader } from "./purchasing-list-reader.js";
import type { Supplier } from "./purchasing-store.js";

export interface PurchaseChoices {
  suppliers: Supplier[];
  today: string;
}

export async function listPurchaseChoices(
  reader: PurchasingListReader,
  clock: Clock,
  zoneRules: ZoneRulesSource,
): Promise<PurchaseChoices> {
  return {
    suppliers: (await reader.suppliers()).filter(mayBePurchasedFrom),
    today: argentinaCalendarDay(clock.now(), zoneRules.zoneRules()),
  };
}
