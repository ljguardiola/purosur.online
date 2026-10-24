import type { FiscalTaskDocumentType } from "../model/fiscal-task.js";
import type {
  OfflineNumberBlockRange,
  OfflineNumberBlockStatus,
} from "../model/offline-number-block.js";

export interface OfflineNumberBlockRecord {
  pointOfSaleNumber: number;
  documentType: FiscalTaskDocumentType;
  registerId: string;
  range: OfflineNumberBlockRange;
  status: OfflineNumberBlockStatus;
}

export interface OfflineNumberBlockStore {
  lockOfflineNumberBlocks(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<void>;
  offlineNumberBlockInUse(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<OfflineNumberBlockRecord | null>;
  highestSyncedOfflineNumber(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<number | null>;
  markOfflineNumberBlockUsedUp(block: OfflineNumberBlockRecord): Promise<void>;
  taxAuthorityLastAuthorized(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<number | null>;
  requireTaxAuthorityCount(
    pointOfSaleNumber: number,
    documentType: FiscalTaskDocumentType,
  ): Promise<void>;
  recordOfflineNumberBlock(record: OfflineNumberBlockRecord): Promise<void>;
}
