import {
  type AssignNextOfflineNumberBlockInput,
  type AssignNextOfflineNumberBlockOutcome,
  assignNextOfflineNumberBlock,
} from "./assign-next-offline-number-block.js";
import type { OfflineNumberBlockStore } from "./offline-number-block-store.js";
import type { RegisterOfflinePointOfSaleStoreTransaction } from "./register-offline-point-of-sale-store.js";

export interface AssignNextOfflineNumberBlocksOutcome {
  series: AssignNextOfflineNumberBlockInput;
  outcome: AssignNextOfflineNumberBlockOutcome;
}

export async function assignNextOfflineNumberBlocks(
  tx: OfflineNumberBlockStore &
    Pick<RegisterOfflinePointOfSaleStoreTransaction, "offlineRegisterOf">,
  series: readonly AssignNextOfflineNumberBlockInput[],
): Promise<AssignNextOfflineNumberBlocksOutcome[]> {
  const distinct = new Map<string, AssignNextOfflineNumberBlockInput>();
  for (const { pointOfSaleNumber, documentType } of series) {
    distinct.set(`${pointOfSaleNumber}:${documentType}`, { pointOfSaleNumber, documentType });
  }
  const inLockOrder = [...distinct.values()].sort(
    (a, b) =>
      a.pointOfSaleNumber - b.pointOfSaleNumber || a.documentType.localeCompare(b.documentType),
  );
  const outcomes: AssignNextOfflineNumberBlocksOutcome[] = [];
  for (const each of inLockOrder) {
    outcomes.push({ series: each, outcome: await assignNextOfflineNumberBlock(tx, each) });
  }
  return outcomes;
}
