import { isSupplierPriceListReadingAbandoned } from "../model/supplier-price-list-reading.js";
import type {
  SupplierPriceListReadingInProgress,
  SupplierPriceListReadings,
} from "./supplier-price-list-readings.js";
import type { SupplierPriceListStore } from "./supplier-price-list-store.js";

export interface SettleAbandonedSupplierPriceListReadingsPorts {
  store: SupplierPriceListStore;
  readings: SupplierPriceListReadings;
}

export interface SettleAbandonedSupplierPriceListReadingsInput {
  now: Date;
}

export type SettleAbandonedSupplierPriceListReadingsOutcome = {
  kind: "settled";
  listIds: string[];
};

export async function settleAbandonedSupplierPriceListReadings(
  { store, readings }: SettleAbandonedSupplierPriceListReadingsPorts,
  { now }: SettleAbandonedSupplierPriceListReadingsInput,
): Promise<SettleAbandonedSupplierPriceListReadingsOutcome> {
  const listIds: string[] = [];
  const failures: unknown[] = [];
  for (const reading of await readings.listInProgress()) {
    if (!isSupplierPriceListReadingAbandoned(reading, now)) {
      continue;
    }
    try {
      if (await settleAbandoned(store, reading, now)) {
        listIds.push(reading.listId);
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      `Settling ${failures.length} abandoned supplier price list readings failed`,
    );
  }
  if (failures.length === 1) {
    throw failures[0];
  }
  return { kind: "settled", listIds };
}

function settleAbandoned(
  store: SupplierPriceListStore,
  reading: SupplierPriceListReadingInProgress,
  now: Date,
): Promise<boolean> {
  return store.transaction(async (tx) => {
    const locked = await tx.lockList(reading.listId);
    if (locked.kind === "not_found" || locked.list.state !== "READING") {
      return false;
    }
    const { sentAt } = locked.list;
    if (!isSupplierPriceListReadingAbandoned({ ...reading, sentAt }, now)) {
      return false;
    }
    await tx.recordReadFailure(
      reading.listId,
      sentAt === null ? "reading_unavailable" : "interrupted",
    );
    return true;
  });
}
