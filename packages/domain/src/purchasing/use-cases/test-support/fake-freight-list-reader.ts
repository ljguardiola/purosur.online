import type { FreightLine } from "../../model/freight-distribution.js";
import type {
  FreightListing,
  FreightListQuery,
  FreightListReader,
  LinkablePurchaseListing,
} from "../freight-list-reader.js";

export interface FakeFreightListData {
  freights?: (FreightListing & { locationId: string })[];
  purchases?: (LinkablePurchaseListing & { locationId: string; lines: FreightLine[] })[];
  links?: { freightId: string; purchaseId: string }[];
}

export class FakeFreightListReader implements FreightListReader {
  readonly freightQueries: FreightListQuery[] = [];
  private readonly data: Required<FakeFreightListData>;

  constructor(data: FakeFreightListData = {}) {
    this.data = {
      freights: data.freights ?? [],
      purchases: data.purchases ?? [],
      links: data.links ?? [],
    };
  }

  async freights(query: FreightListQuery): Promise<FreightListing[]> {
    this.freightQueries.push(query);
    return this.data.freights.filter(
      (freight) =>
        freight.locationId === query.locationId &&
        freight.date >= query.from &&
        (query.to === undefined || freight.date <= query.to) &&
        (query.search === undefined || freight.description.includes(query.search)),
    );
  }

  async purchasesSince(locationId: string, since: string): Promise<LinkablePurchaseListing[]> {
    return this.data.purchases.filter(
      (purchase) => purchase.locationId === locationId && purchase.purchasedOn >= since,
    );
  }

  async purchasesLinkedTo(
    locationId: string,
    freightId: string,
  ): Promise<LinkablePurchaseListing[]> {
    const linked = this.data.links
      .filter((link) => link.freightId === freightId)
      .map((link) => link.purchaseId);
    return this.data.purchases.filter(
      (purchase) => purchase.locationId === locationId && linked.includes(purchase.id),
    );
  }
}
