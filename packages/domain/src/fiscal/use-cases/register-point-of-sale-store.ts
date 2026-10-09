import type { PointOfSaleHolder, PointOfSaleMechanism } from "../model/point-of-sale.js";

export type { PointOfSaleHolder };

export interface RegisterPointOfSale {
  pointOfSaleNumber: number | null;
  fiscalAddressId: string | null;
  version: number;
}

export interface BranchRegisterPointOfSale extends RegisterPointOfSale {
  registerId: string;
  registerName: string;
  offlinePointOfSaleNumber: number | null;
  offlineVersion: number;
}

export interface RegisterPointOfSaleReader {
  listBranchRegisterPointsOfSale(locationId: string): Promise<BranchRegisterPointOfSale[]>;
}

export interface PointOfSaleClaim {
  pointOfSaleNumber: number;
  registerId: string;
  mechanism: PointOfSaleMechanism;
  actorId: string;
}

export interface RegisterPointOfSaleRecord {
  registerId: string;
  pointOfSaleNumber: number;
  fiscalAddressId: string;
  version: number;
  actorId: string;
}

export type LockBranchRegisterResult = { kind: "not_found" } | { kind: "locked" };

// Thrown by a write that loses a point-of-sale number to a concurrent claim by another register.
export class PointOfSaleClaimConflict extends Error {}

export interface RegisterPointOfSaleStore {
  transaction<TOutcome>(
    work: (tx: RegisterPointOfSaleStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RegisterPointOfSaleStoreTransaction {
  lockBranchRegister(locationId: string, registerId: string): Promise<LockBranchRegisterResult>;
  lockRegisterPointOfSale(registerId: string): Promise<RegisterPointOfSale>;
  fiscalAddressExists(fiscalAddressId: string): Promise<boolean>;
  lockPointOfSaleClaim(pointOfSaleNumber: number): Promise<PointOfSaleHolder | undefined>;
  claimPointOfSale(claim: PointOfSaleClaim): Promise<void>;
  recordRegisterPointOfSale(record: RegisterPointOfSaleRecord): Promise<void>;
}
