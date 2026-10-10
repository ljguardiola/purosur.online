import type { RegisterPointOfSaleStoreTransaction } from "./register-point-of-sale-store.js";

export interface RegisterOfflinePointOfSale {
  pointOfSaleNumber: number | null;
  version: number;
}

export interface RegisterOfflinePointOfSaleRecord {
  registerId: string;
  pointOfSaleNumber: number;
  version: number;
  actorId: string;
}

export interface RegisterOfflinePointOfSaleStore {
  transaction<TOutcome>(
    work: (tx: RegisterOfflinePointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RegisterOfflinePointOfSaleStoreTransaction
  extends Pick<
    RegisterPointOfSaleStoreTransaction,
    "lockBranchRegister" | "lockRegisterPointOfSale" | "lockPointOfSaleClaim" | "claimPointOfSale"
  > {
  lockRegisterOfflinePointOfSale(registerId: string): Promise<RegisterOfflinePointOfSale>;
  recordRegisterOfflinePointOfSale(record: RegisterOfflinePointOfSaleRecord): Promise<void>;
}
