import { grantsCapability, type RoleAccess } from "../../permissions/index.js";
import type { ZoneRulesSource } from "../../shared/index.js";
import { type LotName, lotNames, unitCostCents } from "../../stock/index.js";
import type {
  PurchaseFreightListing,
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
  freights: PurchaseFreightListing[] | null;
}

export interface PurchaseViewer extends RoleAccess {
  locationId: string;
}

export interface PurchaseListingPorts {
  reader: PurchasingListReader;
  zoneRules: ZoneRulesSource;
}

async function linkedFreightsOf(
  reader: PurchasingListReader,
  viewer: RoleAccess,
  listings: readonly PurchaseListing[],
): Promise<Map<string, PurchaseFreightListing[]> | null> {
  if (!grantsCapability(viewer, "freights")) {
    return null;
  }
  const linked = new Map<string, PurchaseFreightListing[]>();
  const freights = await reader.linkedFreights(listings.map((listing) => listing.id));
  for (const { purchaseId, ...freight } of freights) {
    linked.set(purchaseId, [...(linked.get(purchaseId) ?? []), freight]);
  }
  return linked;
}

async function listedPurchases(
  { reader, zoneRules }: PurchaseListingPorts,
  locationId: string,
  viewer: RoleAccess,
  listings: readonly PurchaseListing[],
): Promise<ListedPurchase[]> {
  const freights = await linkedFreightsOf(reader, viewer, listings);
  const productIds = [
    ...new Set(listings.flatMap((listing) => listing.lines.map((line) => line.product.id))),
  ];
  const names = lotNames(await reader.lotNameFacts(locationId, productIds), zoneRules.zoneRules());
  return listings.map((listing) => ({
    ...listing,
    freights: freights === null ? null : (freights.get(listing.id) ?? []),
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
  viewer: PurchaseViewer,
  supplierId?: string,
): Promise<ListedPurchase[]> {
  return listedPurchases(
    ports,
    viewer.locationId,
    viewer,
    await ports.reader.purchases(viewer.locationId, supplierId),
  );
}

export async function findPurchaseListing(
  ports: PurchaseListingPorts,
  purchaseId: string,
  viewer: RoleAccess,
): Promise<ListedPurchase | undefined> {
  const listing = await ports.reader.purchase(purchaseId);
  if (!listing) {
    return undefined;
  }
  const [purchase] = await listedPurchases(ports, listing.locationId, viewer, [listing]);
  return purchase;
}
