import type { FiscalDocumentType } from "../../model/fiscal-rejection-alert.js";
import type {
  OfflineNumberBlockRecord,
  OfflineNumberBlockStore,
} from "../offline-number-block-store.js";

export class FakeOfflineNumberBlocks implements OfflineNumberBlockStore {
  readonly blocks: OfflineNumberBlockRecord[];
  readonly operations: string[];
  readonly taxAuthorityCounts: Map<number, number>;
  readonly requiredTaxAuthorityCounts: number[];
  private readonly beforeRecord: () => void;

  constructor(
    blocks: OfflineNumberBlockRecord[] = [],
    operations: string[] = [],
    beforeRecord: () => void = () => {},
    taxAuthorityCounts: Map<number, number> = new Map(),
    requiredTaxAuthorityCounts: number[] = [],
  ) {
    this.blocks = blocks;
    this.operations = operations;
    this.beforeRecord = beforeRecord;
    this.taxAuthorityCounts = taxAuthorityCounts;
    this.requiredTaxAuthorityCounts = requiredTaxAuthorityCounts;
  }

  async taxAuthorityLastAuthorized(pointOfSaleNumber: number): Promise<number | null> {
    this.operations.push("taxAuthorityLastAuthorized");
    return this.taxAuthorityCounts.get(pointOfSaleNumber) ?? null;
  }

  async requireTaxAuthorityCount(pointOfSaleNumber: number): Promise<void> {
    this.operations.push("requireTaxAuthorityCount");
    this.requiredTaxAuthorityCounts.push(pointOfSaleNumber);
  }

  async lockOfflineNumberBlocks(
    _pointOfSaleNumber: number,
    _documentType: FiscalDocumentType,
  ): Promise<void> {
    this.operations.push("lockOfflineNumberBlocks");
  }

  async hasOfflineNumberBlock(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<boolean> {
    this.operations.push("hasOfflineNumberBlock");
    return this.blocks.some(
      (block) =>
        block.pointOfSaleNumber === pointOfSaleNumber && block.documentType === documentType,
    );
  }

  async recordOfflineNumberBlock(record: OfflineNumberBlockRecord): Promise<void> {
    this.operations.push("recordOfflineNumberBlock");
    this.beforeRecord();
    this.blocks.push({ ...record, range: { ...record.range } });
  }
}
