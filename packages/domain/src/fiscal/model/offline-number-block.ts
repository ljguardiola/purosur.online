export const OFFLINE_NUMBER_BLOCK_SIZE = 1000;

export const OFFLINE_NUMBER_BLOCK_STATUSES = ["in_use", "used_up"] as const;

export type OfflineNumberBlockStatus = (typeof OFFLINE_NUMBER_BLOCK_STATUSES)[number];

export interface OfflineNumberBlockRange {
  firstNumber: number;
  lastNumber: number;
}

export function lastUsedOfflineNumber(
  taxAuthorityLastAuthorized: number,
  highestSyncedNumber: number | null,
): number {
  return Math.max(taxAuthorityLastAuthorized, highestSyncedNumber ?? 0);
}

export function firstOfflineNumberBlock(lastUsedNumber: number): OfflineNumberBlockRange {
  return {
    firstNumber: lastUsedNumber + 1,
    lastNumber: lastUsedNumber + OFFLINE_NUMBER_BLOCK_SIZE,
  };
}

export function nextOfflineNumberBlock(current: OfflineNumberBlockRange): OfflineNumberBlockRange {
  return firstOfflineNumberBlock(current.lastNumber);
}

export function isOfflineNumberBlockUsedUp(
  block: OfflineNumberBlockRange,
  highestSyncedNumber: number | null,
): boolean {
  return highestSyncedNumber !== null && highestSyncedNumber >= block.lastNumber;
}

export interface NextOfflineNumberInput {
  blocksInAssignmentOrder: readonly OfflineNumberBlockRange[];
  localLastUsed: number | null;
  taxAuthorityLastAuthorized: number | null;
  highestSyncedNumber: number | null;
}

export function nextOfflineNumber({
  blocksInAssignmentOrder,
  localLastUsed,
  taxAuthorityLastAuthorized,
  highestSyncedNumber,
}: NextOfflineNumberInput): number | null {
  if (taxAuthorityLastAuthorized === null) {
    return null;
  }
  const lastUsedNumber = Math.max(
    localLastUsed ?? 0,
    lastUsedOfflineNumber(taxAuthorityLastAuthorized, highestSyncedNumber),
  );
  for (const block of blocksInAssignmentOrder) {
    if (lastUsedNumber < block.lastNumber) {
      return Math.max(block.firstNumber, lastUsedNumber + 1);
    }
  }
  return null;
}
