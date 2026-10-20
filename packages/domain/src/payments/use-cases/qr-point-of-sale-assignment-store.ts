export interface QrPointOfSaleAssignment {
  externalPosId: string | null;
  version: number;
}

export interface QrPointOfSaleAssignmentRecord {
  registerId: string;
  externalPosId: string | null;
  version: number;
  actorId: string;
}

export type LockBranchRegisterResult = { kind: "not_found" } | { kind: "locked" };

export class QrPointOfSaleAlreadyAssigned extends Error {}

export interface QrPointOfSaleAssignmentStore {
  transaction<TOutcome>(
    work: (tx: QrPointOfSaleAssignmentStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface QrPointOfSaleAssignmentStoreTransaction {
  lockBranchRegister(locationId: string, registerId: string): Promise<LockBranchRegisterResult>;
  lockRegisterQrPointOfSale(registerId: string): Promise<QrPointOfSaleAssignment>;
  lockQrPointOfSaleHolder(externalPosId: string): Promise<string | undefined>;
  recordQrPointOfSaleAssignment(record: QrPointOfSaleAssignmentRecord): Promise<void>;
}
