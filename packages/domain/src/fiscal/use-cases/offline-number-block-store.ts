import type { FiscalDocumentType } from "../model/fiscal-rejection-alert.js";
import type {
  OfflineNumberBlockRange,
  OfflineNumberBlockStatus,
} from "../model/offline-number-block.js";

export interface OfflineNumberBlockRecord {
  pointOfSaleNumber: number;
  documentType: FiscalDocumentType;
  registerId: string;
  range: OfflineNumberBlockRange;
  status: OfflineNumberBlockStatus;
}

export interface OfflineNumberBlockStore {
  lockOfflineNumberBlocks(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<void>;
  hasOfflineNumberBlockInUse(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<boolean>;
  lastOfflineNumberBlock(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<OfflineNumberBlockRange | null>;
  recordOfflineNumberBlock(record: OfflineNumberBlockRecord): Promise<void>;
}
