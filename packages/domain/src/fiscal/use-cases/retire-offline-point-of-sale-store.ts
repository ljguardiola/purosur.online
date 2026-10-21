import type { PointOfSaleHolder } from "../model/point-of-sale.js";
import type { RegisterOfflinePointOfSaleStoreTransaction } from "./register-offline-point-of-sale-store.js";

export interface RetireOfflinePointOfSaleRecord {
  pointOfSaleNumber: number;
  retiredAt: Date;
  actorId: string;
}

export interface BranchOfflinePointOfSale {
  pointOfSaleNumber: number;
  registerId: string;
  registerName: string;
  retirable: boolean;
  retiredAt: Date | null;
}

export interface BranchOfflinePointOfSaleReader {
  listBranchOfflinePointsOfSaleWithoutRegister(
    locationId: string,
  ): Promise<BranchOfflinePointOfSale[]>;
}

export interface RetireOfflinePointOfSaleStore {
  transaction<TOutcome>(
    work: (tx: RetireOfflinePointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RetireOfflinePointOfSaleStoreTransaction
  extends Pick<
    RegisterOfflinePointOfSaleStoreTransaction,
    "lockPointOfSale" | "offlineRegisterOf"
  > {
  branchPointOfSaleClaim(
    locationId: string,
    pointOfSaleNumber: number,
  ): Promise<PointOfSaleHolder | undefined>;
  retirePointOfSale(record: RetireOfflinePointOfSaleRecord): Promise<void>;
}
