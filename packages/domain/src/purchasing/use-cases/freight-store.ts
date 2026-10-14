import type { FreightMeans } from "../model/freight.js";
import type { FreightLine } from "../model/freight-distribution.js";

export interface FreightValues {
  date: string;
  amountCents: number;
  description: string;
  means: FreightMeans;
  purchaseIds: string[];
}

export interface Freight extends FreightValues {
  id: string;
  locationId: string;
  recordedAt: Date;
  actorId: string;
}

export interface NewFreightFields extends FreightValues {
  locationId: string;
  recordedAt: Date;
  actorId: string;
}

export interface FreightPurchase {
  id: string;
  lines: FreightLine[];
}

export interface FreightEdit {
  freightId: string;
  actorId: string;
  editedAt: Date;
  previous: FreightValues;
  next: FreightValues;
}

export type LockFreightResult = { kind: "not_found" } | { kind: "locked"; freight: Freight };

export interface FreightStoreTransaction {
  // Answers the branch's purchases among the ones asked for, holding their rows, so a purchase of
  // another branch or one that does not exist is simply not answered.
  lockPurchasesForFreight(
    locationId: string,
    purchaseIds: readonly string[],
  ): Promise<FreightPurchase[]>;
  insertFreight(fields: NewFreightFields): Promise<{ id: string }>;
  lockFreight(locationId: string, freightId: string): Promise<LockFreightResult>;
  // Replaces what an edit may change; who recorded the freight and when stay.
  replaceFreight(freightId: string, values: FreightValues): Promise<void>;
  recordFreightEdit(edit: FreightEdit): Promise<void>;
}

export interface FreightStore {
  transaction<TOutcome>(
    work: (tx: FreightStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
