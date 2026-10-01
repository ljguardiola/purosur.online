export interface IssuerIdentification {
  legalName: string | null;
  grossIncomeRegistration: string | null;
  activityStartDate: string | null;
  authorizedCuit: string | null;
  version: number;
}

export interface AuthorizedIssuerIdentification extends IssuerIdentification {
  authorizedCuit: string;
}

export interface NewIssuerIdentificationVersion extends AuthorizedIssuerIdentification {
  recordedBy: string | null;
}

export interface IssuerIdentificationPorts {
  store: IssuerIdentificationStore;
}

export interface IssuerIdentificationStore {
  transaction<TOutcome>(
    work: (tx: IssuerIdentificationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface IssuerIdentificationStoreTransaction {
  lockCurrentIssuerIdentification(): Promise<IssuerIdentification>;
  recordIssuerIdentificationVersion(
    next: NewIssuerIdentificationVersion,
    previous: IssuerIdentification,
  ): Promise<void>;
}
