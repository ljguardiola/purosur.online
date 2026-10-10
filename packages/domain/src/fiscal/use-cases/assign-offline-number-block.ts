import type { FiscalDocumentType } from "../model/fiscal-rejection-alert.js";
import {
  nextOfflineNumberBlock,
  type OfflineNumberBlockRange,
} from "../model/offline-number-block.js";
import type { OfflineNumberBlockStore } from "./offline-number-block-store.js";

export interface AssignOfflineNumberBlockInput {
  pointOfSaleNumber: number;
  documentType: FiscalDocumentType;
  registerId: string;
}

export type AssignOfflineNumberBlockOutcome = { kind: "assigned"; range: OfflineNumberBlockRange };

export type AssignFirstOfflineNumberBlockOutcome =
  | AssignOfflineNumberBlockOutcome
  | { kind: "already_has_block" };

export async function assignOfflineNumberBlock(
  store: OfflineNumberBlockStore,
  input: AssignOfflineNumberBlockInput,
): Promise<AssignOfflineNumberBlockOutcome> {
  await store.lockOfflineNumberBlocks(input.pointOfSaleNumber, input.documentType);
  return recordNextBlock(store, input);
}

export async function assignFirstOfflineNumberBlock(
  store: OfflineNumberBlockStore,
  input: AssignOfflineNumberBlockInput,
): Promise<AssignFirstOfflineNumberBlockOutcome> {
  await store.lockOfflineNumberBlocks(input.pointOfSaleNumber, input.documentType);
  if (await store.hasOfflineNumberBlockInUse(input.pointOfSaleNumber, input.documentType)) {
    return { kind: "already_has_block" };
  }
  return recordNextBlock(store, input);
}

async function recordNextBlock(
  store: OfflineNumberBlockStore,
  input: AssignOfflineNumberBlockInput,
): Promise<AssignOfflineNumberBlockOutcome> {
  const range = nextOfflineNumberBlock(
    await store.lastOfflineNumberBlock(input.pointOfSaleNumber, input.documentType),
  );
  await store.recordOfflineNumberBlock({ ...input, range, status: "in_use" });
  return { kind: "assigned", range };
}
