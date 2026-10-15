import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import {
  firstOfflineNumberBlock,
  lastUsedOfflineNumber,
  type OfflineNumberBlockRange,
} from "../model/offline-number-block.js";
import type { OfflineNumberBlockStore } from "./offline-number-block-store.js";

export interface AssignOfflineNumberBlockInput {
  pointOfSaleNumber: number;
  documentType: FiscalDocumentType;
  registerId: string;
}

export type AssignFirstOfflineNumberBlockOutcome =
  | { kind: "assigned"; range: OfflineNumberBlockRange }
  | { kind: "already_has_block" }
  | { kind: "tax_authority_count_unknown" };

export async function assignFirstOfflineNumberBlock(
  store: OfflineNumberBlockStore,
  input: AssignOfflineNumberBlockInput,
): Promise<AssignFirstOfflineNumberBlockOutcome> {
  await store.lockOfflineNumberBlocks(input.pointOfSaleNumber, input.documentType);
  return assignFirstOfflineNumberBlockLocked(store, input);
}

export async function assignFirstOfflineNumberBlockLocked(
  store: OfflineNumberBlockStore,
  input: AssignOfflineNumberBlockInput,
): Promise<AssignFirstOfflineNumberBlockOutcome> {
  if (await store.offlineNumberBlockInUse(input.pointOfSaleNumber, input.documentType)) {
    return { kind: "already_has_block" };
  }
  const taxAuthorityLastAuthorized = await store.taxAuthorityLastAuthorized(
    input.pointOfSaleNumber,
  );
  if (taxAuthorityLastAuthorized === null) {
    await store.requireTaxAuthorityCount(input.pointOfSaleNumber);
    return { kind: "tax_authority_count_unknown" };
  }
  const highestSyncedNumber = await store.highestSyncedOfflineNumber(
    input.pointOfSaleNumber,
    input.documentType,
  );
  const range = firstOfflineNumberBlock(
    lastUsedOfflineNumber(taxAuthorityLastAuthorized, highestSyncedNumber),
  );
  await store.recordOfflineNumberBlock({ ...input, range, status: "in_use" });
  return { kind: "assigned", range };
}
