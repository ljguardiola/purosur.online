import {
  type FiscalDocumentState,
  OUTCOME_UNKNOWN_FISCAL_DOCUMENT_STATES,
} from "../model/real-time-authorization.js";

export interface CompletedSaleFiscalDocument {
  id: string;
  saleId: string;
  completedAt: Date;
  total: number;
}

export interface CompletedSaleFiscalDocuments {
  documentsIn(states: readonly FiscalDocumentState[]): CompletedSaleFiscalDocument[];
}

export function readUnknownFiscalDocuments({
  documents,
}: {
  documents: CompletedSaleFiscalDocuments;
}): CompletedSaleFiscalDocument[] {
  return documents.documentsIn(OUTCOME_UNKNOWN_FISCAL_DOCUMENT_STATES);
}
