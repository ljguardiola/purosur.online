import type { ZoneRulesSource } from "../../shared/index.js";
import { type LotName, lotNames, unitCostCents } from "../../stock/index.js";
import type {
  PurchaseLineListing,
  PurchaseListing,
  PurchasingListReader,
} from "./purchasing-list-reader.js";

export interface ListedPurchaseLine extends PurchaseLineListing {
  unitCostCents: number;
  lotName: LotName;
}

export interface ListedPurchase extends PurchaseListing {
  lines: ListedPurchaseLine[];
}

export interface PurchaseListingPorts {
  reader: PurchasingListReader;
  zoneRules: ZoneRulesSource;
}

async function listedPurchases(
  { reader, zoneRules }: PurchaseListingPorts,
  locationId: string,
  listings: readonly PurchaseListing[],
): Promise<ListedPurchase[]> {
  const productIds = [
    ...new Set(listings.flatMap((listing) => listing.lines.map((line) => line.product.id))),
  ];
  const names = lotNames(await reader.lotNameFacts(locationId, productIds), zoneRules.zoneRules());
  return listings.map((listing) => ({
    ...listing,
    lines: listing.lines.map((line) => {
      const lotName = names.get(line.lotId);
      if (lotName === undefined) {
        throw new Error(`no name facts for lot ${line.lotId}`);
      }
      return {
        ...line,
        unitCostCents: unitCostCents(line.costPaidCents, line.quantityPerPackage),
        lotName,
      };
    }),
  }));
}

export async function listPurchases(
  ports: PurchaseListingPorts,
  locationId: string,
  supplierId?: string,
): Promise<ListedPurchase[]> {
  return listedPurchases(ports, locationId, await ports.reader.purchases(locationId, supplierId));
}

export async function findPurchaseListing(
  ports: PurchaseListingPorts,
  purchaseId: string,
): Promise<ListedPurchase | undefined> {
  const listing = await ports.reader.purchase(purchaseId);
  if (!listing) {
    return undefined;
  }
  const [purchase] = await listedPurchases(ports, listing.locationId, [listing]);
  return purchase;
}
