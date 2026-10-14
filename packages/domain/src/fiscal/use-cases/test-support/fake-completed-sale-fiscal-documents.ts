import type { FiscalDocumentState } from "../../model/real-time-authorization.js";
import type {
  CompletedSaleFiscalDocument,
  CompletedSaleFiscalDocuments,
} from "../read-unknown-fiscal-documents.js";

export class FakeCompletedSaleFiscalDocuments implements CompletedSaleFiscalDocuments {
  private readonly documents: (CompletedSaleFiscalDocument & { state: FiscalDocumentState })[];

  constructor(documents: (CompletedSaleFiscalDocument & { state: FiscalDocumentState })[] = []) {
    this.documents = documents;
  }

  documentsIn(states: readonly FiscalDocumentState[]): CompletedSaleFiscalDocument[] {
    return this.documents
      .filter(({ state }) => states.includes(state))
      .map(({ state: _state, ...document }) => document);
  }
}
