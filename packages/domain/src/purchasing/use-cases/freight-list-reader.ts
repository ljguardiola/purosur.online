import type { FreightMeans } from "../model/freight.js";
import type { FreightLine } from "../model/freight-distribution.js";
import type { ReceiptType } from "../model/purchase.js";

export interface FreightPurchaseListing {
  id: string;
  purchasedOn: string;
  supplier: { id: string; name: string };
}

export interface FreightListing {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  means: FreightMeans;
  purchases: FreightPurchaseListing[];
}

export interface FreightListQuery {
  locationId: string;
  from: string;
  to?: string;
  search?: string;
}

export interface LinkablePurchaseListing extends FreightPurchaseListing {
  recordedAt: Date;
  receiptType: ReceiptType;
  receiptNumber: string | null;
  lines: FreightLine[];
}

export interface FreightListReader {
  // The branch's freights dated within the period, newest first, whose description, carrier or
  // supplier names contain the search text when there is one.
  freights(query: FreightListQuery): Promise<FreightListing[]>;
  purchasesSince(locationId: string, since: string): Promise<LinkablePurchaseListing[]>;
  purchasesLinkedTo(locationId: string, freightId: string): Promise<LinkablePurchaseListing[]>;
}
