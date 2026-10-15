import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
import {
  isOfflineNumberBlockUsedUp,
  nextOfflineNumberBlock,
  type OfflineNumberBlockRange,
} from "../model/offline-number-block.js";
import type { OfflineNumberBlockStore } from "./offline-number-block-store.js";
import type { RegisterOfflinePointOfSaleStoreTransaction } from "./register-offline-point-of-sale-store.js";

export interface AssignNextOfflineNumberBlockInput {
  pointOfSaleNumber: number;
  documentType: FiscalDocumentType;
}

export type AssignNextOfflineNumberBlockOutcome =
  | { kind: "assigned"; range: OfflineNumberBlockRange }
  | { kind: "no_block_in_use" }
  | { kind: "block_not_used_up" }
  | { kind: "no_offline_register" };

export async function assignNextOfflineNumberBlock(
  tx: OfflineNumberBlockStore &
    Pick<RegisterOfflinePointOfSaleStoreTransaction, "offlineRegisterOf">,
  { pointOfSaleNumber, documentType }: AssignNextOfflineNumberBlockInput,
): Promise<AssignNextOfflineNumberBlockOutcome> {
  await tx.lockOfflineNumberBlocks(pointOfSaleNumber, documentType);
  const current = await tx.offlineNumberBlockInUse(pointOfSaleNumber, documentType);
  if (current === null) {
    return { kind: "no_block_in_use" };
  }
  const highestSyncedNumber = await tx.highestSyncedOfflineNumber(pointOfSaleNumber, documentType);
  if (!isOfflineNumberBlockUsedUp(current.range, highestSyncedNumber)) {
    return { kind: "block_not_used_up" };
  }
  const registerId = await tx.offlineRegisterOf(pointOfSaleNumber);
  if (registerId === null) {
    return { kind: "no_offline_register" };
  }
  await tx.markOfflineNumberBlockUsedUp(current);
  const range = nextOfflineNumberBlock(current.range);
  await tx.recordOfflineNumberBlock({
    pointOfSaleNumber,
    documentType,
    registerId,
    range,
    status: "in_use",
  });
  return { kind: "assigned", range };
}
