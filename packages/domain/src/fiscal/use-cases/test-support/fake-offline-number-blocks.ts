import type { FiscalDocumentType } from "../../model/fiscal-rejection-alert.js";
import type { OfflineNumberBlockRange } from "../../model/offline-number-block.js";
import type {
  OfflineNumberBlockRecord,
  OfflineNumberBlockStore,
} from "../offline-number-block-store.js";

export class FakeOfflineNumberBlocks implements OfflineNumberBlockStore {
  readonly blocks: OfflineNumberBlockRecord[];
  readonly operations: string[];
  private readonly beforeRecord: () => void;

  constructor(
    blocks: OfflineNumberBlockRecord[] = [],
    operations: string[] = [],
    beforeRecord: () => void = () => {},
  ) {
    this.blocks = blocks;
    this.operations = operations;
    this.beforeRecord = beforeRecord;
  }

  async lockOfflineNumberBlocks(
    _pointOfSaleNumber: number,
    _documentType: FiscalDocumentType,
  ): Promise<void> {
    this.operations.push("lockOfflineNumberBlocks");
  }

  async hasOfflineNumberBlockInUse(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<boolean> {
    this.operations.push("hasOfflineNumberBlockInUse");
    return this.blocksOf(pointOfSaleNumber, documentType).some(
      (block) => block.status === "in_use",
    );
  }

  async lastOfflineNumberBlock(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<OfflineNumberBlockRange | null> {
    this.operations.push("lastOfflineNumberBlock");
    const last = this.blocksOf(pointOfSaleNumber, documentType)
      .map((block) => block.range)
      .sort((a, b) => b.lastNumber - a.lastNumber)[0];
    return last === undefined ? null : { ...last };
  }

  async recordOfflineNumberBlock(record: OfflineNumberBlockRecord): Promise<void> {
    this.operations.push("recordOfflineNumberBlock");
    this.beforeRecord();
    this.blocks.push({ ...record, range: { ...record.range } });
  }

  private blocksOf(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): OfflineNumberBlockRecord[] {
    return this.blocks.filter(
      (block) =>
        block.pointOfSaleNumber === pointOfSaleNumber && block.documentType === documentType,
    );
  }
}
