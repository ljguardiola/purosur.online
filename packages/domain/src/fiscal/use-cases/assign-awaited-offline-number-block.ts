import type { FiscalTaskDocumentType } from "../model/fiscal-task.js";
import {
  type AssignFirstOfflineNumberBlockOutcome,
  assignFirstOfflineNumberBlockLocked,
} from "./assign-offline-number-block.js";
import type { RegisterOfflinePointOfSaleStore } from "./register-offline-point-of-sale-store.js";

export interface AssignAwaitedOfflineNumberBlockInput {
  pointOfSaleNumber: number;
  documentType: FiscalTaskDocumentType;
}

export type AssignAwaitedOfflineNumberBlockOutcome =
  | AssignFirstOfflineNumberBlockOutcome
  | { kind: "no_offline_register" };

export function assignAwaitedOfflineNumberBlock(
  store: RegisterOfflinePointOfSaleStore,
  { pointOfSaleNumber, documentType }: AssignAwaitedOfflineNumberBlockInput,
): Promise<AssignAwaitedOfflineNumberBlockOutcome> {
  return store.transaction<AssignAwaitedOfflineNumberBlockOutcome>(async (tx) => {
    await tx.lockOfflineNumberBlocks(pointOfSaleNumber, documentType);
    const registerId = await tx.offlineRegisterOf(pointOfSaleNumber);
    if (registerId === null) {
      return { kind: "no_offline_register" };
    }
    return assignFirstOfflineNumberBlockLocked(tx, {
      pointOfSaleNumber,
      documentType,
      registerId,
    });
  });
}
