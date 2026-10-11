import { FACTURA_C_DOCUMENT_TYPE } from "../model/fiscal-rejection-alert.js";
import {
  type AssignFirstOfflineNumberBlockOutcome,
  assignFirstOfflineNumberBlockLocked,
} from "./assign-offline-number-block.js";
import type { RegisterOfflinePointOfSaleStore } from "./register-offline-point-of-sale-store.js";

export interface AssignAwaitedOfflineNumberBlockInput {
  pointOfSaleNumber: number;
}

export type AssignAwaitedOfflineNumberBlockOutcome =
  | AssignFirstOfflineNumberBlockOutcome
  | { kind: "no_offline_register" };

export function assignAwaitedOfflineNumberBlock(
  store: RegisterOfflinePointOfSaleStore,
  { pointOfSaleNumber }: AssignAwaitedOfflineNumberBlockInput,
): Promise<AssignAwaitedOfflineNumberBlockOutcome> {
  return store.transaction<AssignAwaitedOfflineNumberBlockOutcome>(async (tx) => {
    await tx.lockOfflineNumberBlocks(pointOfSaleNumber, FACTURA_C_DOCUMENT_TYPE);
    const registerId = await tx.offlineRegisterOf(pointOfSaleNumber);
    if (registerId === null) {
      return { kind: "no_offline_register" };
    }
    return assignFirstOfflineNumberBlockLocked(tx, {
      pointOfSaleNumber,
      documentType: FACTURA_C_DOCUMENT_TYPE,
      registerId,
    });
  });
}
