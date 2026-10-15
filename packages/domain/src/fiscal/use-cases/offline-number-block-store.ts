import type { FiscalDocumentType } from "../model/fiscal-rejection-standing.js";
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
  offlineNumberBlockInUse(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<OfflineNumberBlockRecord | null>;
  highestSyncedOfflineNumber(
    pointOfSaleNumber: number,
    documentType: FiscalDocumentType,
  ): Promise<number | null>;
  markOfflineNumberBlockUsedUp(block: OfflineNumberBlockRecord): Promise<void>;
  taxAuthorityLastAuthorized(pointOfSaleNumber: number): Promise<number | null>;
  requireTaxAuthorityCount(pointOfSaleNumber: number): Promise<void>;
  recordOfflineNumberBlock(record: OfflineNumberBlockRecord): Promise<void>;
}
