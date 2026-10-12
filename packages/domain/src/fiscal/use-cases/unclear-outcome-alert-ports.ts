import type { AlertLevel } from "../../alerts/index.js";

export interface UnclearDocumentWithoutAlert {
  fiscalDocumentId: string;
  saleId: string;
  registerId: string;
  pointOfSale: number;
  number: number;
  unclearSince: Date;
}

export interface UnclearOutcomeAlertTransaction {
  lockUnclearDocumentsWithoutUnclearOutcomeAlert(): Promise<UnclearDocumentWithoutAlert[]>;
  openUnclearOutcomeAlert(
    document: UnclearDocumentWithoutAlert,
    level: AlertLevel,
    openedAt: Date,
  ): Promise<void>;
}

export interface UnclearOutcomeAlertStore {
  transaction<TOutcome>(
    work: (tx: UnclearOutcomeAlertTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}
