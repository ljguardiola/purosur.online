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

export interface NextOfflineNumberInput {
  blocksInAssignmentOrder: readonly OfflineNumberBlockRange[];
  localLastUsed: number | null;
  taxAuthorityLastAuthorized: number | null;
}

export function nextOfflineNumber({
  blocksInAssignmentOrder,
  localLastUsed,
  taxAuthorityLastAuthorized,
}: NextOfflineNumberInput): number | null {
  if (taxAuthorityLastAuthorized === null) {
    return null;
  }
  const lastUsedNumber = Math.max(localLastUsed ?? 0, taxAuthorityLastAuthorized);
  for (const block of blocksInAssignmentOrder) {
    if (lastUsedNumber < block.lastNumber) {
      return Math.max(block.firstNumber, lastUsedNumber + 1);
    }
  }
  return null;
}
