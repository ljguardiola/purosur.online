import type { FiscalTaskDocumentType } from "../../model/fiscal-task.js";
import type {
  OfflineNumberBlockRecord,
  OfflineNumberBlockStore,
} from "../offline-number-block-store.js";

export interface RequiredTaxAuthorityCount {
  pointOfSaleNumber: number;
  documentType: FiscalTaskDocumentType;
}

export function seriesKey(pointOfSaleNumber: number, documentType: FiscalTaskDocumentType): string {
  return `${pointOfSaleNumber}:${documentType}`;
}

export interface LockedOfflineNumberSeries {
  pointOfSaleNumber: number;
  documentType: FiscalTaskDocumentType;
}

export class FakeOfflineNumberBlocks implements OfflineNumberBlockStore {
  readonly blocks: OfflineNumberBlockRecord[];
  readonly operations: string[];
  readonly taxAuthorityCounts: Map<string, number>;
  readonly requiredTaxAuthorityCounts: RequiredTaxAuthorityCount[];
  readonly highestSyncedNumbers: Map<string, number>;
  readonly lockedSeries: LockedOfflineNumberSeries[];
  private readonly beforeRecord: () => void;

  constructor(
    blocks: OfflineNumberBlockRecord[] = [],
    operations: string[] = [],
    beforeRecord: () => void = () => {},
    taxAuthorityCounts: Map<string, number> = new Map(),
    requiredTaxAuthorityCounts: RequiredTaxAuthorityCount[] = [],
    highestSyncedNumbers: Map<string, number> = new Map(),
    lockedSeries: LockedOfflineNumberSeries[] = [],
  ) {
    this.blocks = blocks;
    this.operations = operations;
    this.beforeRecord = beforeRecord;
    this.taxAuthorityCounts = taxAuthorityCounts;
    this.requiredTaxAuthorityCounts = requiredTaxAuthorityCounts;
    this.highestSyncedNumbers = highestSyncedNumbers;
    this.lockedSeries = lockedSeries;
  }

  async highestSyncedOfflineNumber(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<number | null> {
    this.operations.push("highestSyncedOfflineNumber");
    return this.highestSyncedNumbers.get(seriesKey(pointOfSaleNumber, documentType)) ?? null;
  }

  async markOfflineNumberBlockUsedUp(block: OfflineNumberBlockRecord): Promise<void> {
    this.operations.push("markOfflineNumberBlockUsedUp");
    const held = this.blocks.find(
      (candidate) =>
        candidate.pointOfSaleNumber === block.pointOfSaleNumber &&
        candidate.documentType === block.documentType &&
        candidate.range.firstNumber === block.range.firstNumber,
    );
    if (held !== undefined) {
      held.status = "used_up";
    }
  }

  async taxAuthorityLastAuthorized(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<number | null> {
    this.operations.push("taxAuthorityLastAuthorized");
    return this.taxAuthorityCounts.get(seriesKey(pointOfSaleNumber, documentType)) ?? null;
  }

  async requireTaxAuthorityCount(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<void> {
    this.operations.push("requireTaxAuthorityCount");
    this.requiredTaxAuthorityCounts.push({ pointOfSaleNumber, documentType });
  }

  async lockOfflineNumberBlocks(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<void> {
    this.operations.push("lockOfflineNumberBlocks");
    this.lockedSeries.push({ pointOfSaleNumber, documentType });
  }

  async offlineNumberBlockInUse(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<OfflineNumberBlockRecord | null> {
    this.operations.push("offlineNumberBlockInUse");
    const held = this.blocks.find(
      (block) =>
        block.pointOfSaleNumber === pointOfSaleNumber &&
        block.documentType === documentType &&
        block.status === "in_use",
    );
    return held === undefined ? null : structuredClone(held);
  }

  async recordOfflineNumberBlock(record: OfflineNumberBlockRecord): Promise<void> {
    this.operations.push("recordOfflineNumberBlock");
    this.beforeRecord();
    this.blocks.push({ ...record, range: { ...record.range } });
  }
}
