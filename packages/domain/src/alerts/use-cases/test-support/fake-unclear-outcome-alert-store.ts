import type { AlertLevel } from "../../model/alert-catalog.js";
import type {
  UnclearDocumentWithoutAlert,
  UnclearOutcomeAlertStore,
  UnclearOutcomeAlertTransaction,
} from "../unclear-outcome-alert-ports.js";

export interface FakeUnclearDocument extends UnclearDocumentWithoutAlert {
  hasOpenUnclearOutcomeAlert: boolean;
}

export interface OpenedUnclearOutcomeAlert extends UnclearDocumentWithoutAlert {
  level: AlertLevel;
  openedAt: Date;
}

type UnclearOutcomeAlertStep = "lockDocuments" | "openUnclearOutcomeAlert";

class FakeUnclearOutcomeAlertTransaction implements UnclearOutcomeAlertTransaction {
  private readonly store: FakeUnclearOutcomeAlertStore;

  constructor(store: FakeUnclearOutcomeAlertStore) {
    this.store = store;
  }

  async lockUnclearDocumentsWithoutUnclearOutcomeAlert(): Promise<UnclearDocumentWithoutAlert[]> {
    this.store.operationOrder.push("lockDocuments");
    return this.store.documents
      .filter((document) => !document.hasOpenUnclearOutcomeAlert)
      .map(({ fiscalDocumentId, saleId, registerId, pointOfSale, number, unclearSince }) => ({
        fiscalDocumentId,
        saleId,
        registerId,
        pointOfSale,
        number,
        unclearSince,
      }));
  }

  async openUnclearOutcomeAlert(
    document: UnclearDocumentWithoutAlert,
    level: AlertLevel,
    openedAt: Date,
  ): Promise<void> {
    this.store.operationOrder.push("openUnclearOutcomeAlert");
    if (this.store.failOn === "openUnclearOutcomeAlert") {
      throw new Error("openUnclearOutcomeAlert failed");
    }
    this.store.opened.push({ ...document, level, openedAt });
    for (const stored of this.store.documents) {
      if (stored.fiscalDocumentId === document.fiscalDocumentId) {
        stored.hasOpenUnclearOutcomeAlert = true;
      }
    }
  }
}

export class FakeUnclearOutcomeAlertStore implements UnclearOutcomeAlertStore {
  documents: FakeUnclearDocument[];
  opened: OpenedUnclearOutcomeAlert[] = [];
  operationOrder: UnclearOutcomeAlertStep[] = [];
  failOn: UnclearOutcomeAlertStep | undefined;
  transactions = 0;

  constructor(documents: FakeUnclearDocument[] = []) {
    this.documents = documents;
  }

  async transaction<TOutcome>(
    work: (tx: UnclearOutcomeAlertTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const documentsBefore = structuredClone(this.documents);
    const openedBefore = [...this.opened];
    try {
      return await work(new FakeUnclearOutcomeAlertTransaction(this));
    } catch (error) {
      this.documents = documentsBefore;
      this.opened = openedBefore;
      throw error;
    }
  }
}
