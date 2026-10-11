export const OFFLINE_NUMBER_BLOCK_SIZE = 1000;

export const OFFLINE_NUMBER_BLOCK_STATUSES = ["in_use"] as const;

export type OfflineNumberBlockStatus = (typeof OFFLINE_NUMBER_BLOCK_STATUSES)[number];

export interface OfflineNumberBlockRange {
  firstNumber: number;
  lastNumber: number;
}

export function firstOfflineNumberBlock(
  taxAuthorityLastAuthorized: number,
): OfflineNumberBlockRange {
  return {
    firstNumber: taxAuthorityLastAuthorized + 1,
    lastNumber: taxAuthorityLastAuthorized + OFFLINE_NUMBER_BLOCK_SIZE,
  };
}

export function nextOfflineNumber(
  blocksInAssignmentOrder: readonly OfflineNumberBlockRange[],
  lastUsedNumber: number | null,
): number | null {
  for (const block of blocksInAssignmentOrder) {
    if (lastUsedNumber === null) {
      return block.firstNumber;
    }
    if (lastUsedNumber < block.lastNumber) {
      return Math.max(block.firstNumber, lastUsedNumber + 1);
    }
  }
  return null;
}
