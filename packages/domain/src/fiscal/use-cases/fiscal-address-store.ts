export interface FiscalAddress {
  id: string;
  name: string;
  streetAddress: string;
  version: number;
}

export interface NewFiscalAddress {
  name: string;
  streetAddress: string;
  actorId: string;
}

export interface FiscalAddressChange {
  id: string;
  name: string;
  streetAddress: string;
  version: number;
  actorId: string;
}

export class FiscalAddressNameConflict extends Error {}

export interface FiscalAddressPorts {
  store: FiscalAddressStore;
}

export interface FiscalAddressStore {
  transaction<TOutcome>(
    work: (tx: FiscalAddressStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface FiscalAddressStoreTransaction {
  listFiscalAddresses(): Promise<FiscalAddress[]>;
  lockFiscalAddress(fiscalAddressId: string): Promise<FiscalAddress | undefined>;
  insertFiscalAddress(fiscalAddress: NewFiscalAddress): Promise<{ id: string }>;
  updateFiscalAddress(change: FiscalAddressChange): Promise<void>;
}

export interface FiscalAddressReader {
  listFiscalAddresses(): Promise<FiscalAddress[]>;
}
