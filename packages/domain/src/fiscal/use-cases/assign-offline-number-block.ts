import type { FiscalDocumentType } from "../model/fiscal-rejection-alert.js";
import {
  firstOfflineNumberBlock,
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
  | { kind: "already_has_block" };

export async function assignFirstOfflineNumberBlock(
  store: OfflineNumberBlockStore,
  input: AssignOfflineNumberBlockInput,
): Promise<AssignFirstOfflineNumberBlockOutcome> {
  await store.lockOfflineNumberBlocks(input.pointOfSaleNumber, input.documentType);
  if (await store.hasOfflineNumberBlock(input.pointOfSaleNumber, input.documentType)) {
    return { kind: "already_has_block" };
  }
  const range = firstOfflineNumberBlock();
  await store.recordOfflineNumberBlock({ ...input, range, status: "in_use" });
  return { kind: "assigned", range };
}
