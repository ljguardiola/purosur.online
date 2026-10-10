import type { FiscalDocumentType } from "../../model/fiscal-rejection-alert.js";
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
